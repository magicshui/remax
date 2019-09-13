import { get } from 'dot-prop';
import kebabCase from 'lodash/kebabCase';
import { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import template from '@babel/template';
import * as path from 'path';
import * as htmlparser2 from 'htmlparser2';
import * as fs from 'fs';
import shortid from 'shortid';
import { Adapter } from '../../adapters';
import { isNativeComponent, pushArray } from './util';
import { RemaxOptions } from '../../../getConfig';

interface Component {
  type: string;
  id: string;
  props: string[];
  children?: Component[];
  importer?: string;
}

interface NativeComponents {
  [id: string]: Component;
}

let nativeId = 0;

const nativeComponents: NativeComponents = {};

const parser = new htmlparser2.Parser({});

const usingComponents: string[] = [];
const jsHelpers: string[] = [];

const collectUsingComponents = (sourcePath: string) => {
  const components: { [key: string]: string } =
    require(sourcePath.replace(/\.js$/, '.json')).usingComponents || {};

  const componentPaths = Object.values(components);

  componentPaths.forEach((value: string) => {
    const componentPath = path.join(path.dirname(sourcePath), value) + '.js';

    if (!fs.existsSync(componentPath)) {
      return;
    }

    pushArray(usingComponents, componentPath);
  });

  return componentPaths;
};

const collectJsHelper = (sourcePath: string, adapter: Adapter) => {
  const templateContent = fs
    .readFileSync(sourcePath.replace(/\.js$/, adapter.extensions.template))
    .toString();

  const jsHelperPaths: string[] = [];

  parser._cbs.onopentag = (name, attrs) => {
    if (name === adapter.extensions.jsTag && attrs.src) {
      const moduleName = adapter.extensions.moduleName;
      if (!moduleName) {
        return;
      }
      const jsHelperPath = path.join(path.dirname(sourcePath), attrs.src);

      if (!fs.existsSync(jsHelperPath)) {
        return;
      }

      jsHelperPaths.push(jsHelperPath);
      pushArray(jsHelpers, jsHelperPath);
    }
  };

  parser.reset();
  parser.write(templateContent);
  parser.end();

  return jsHelperPaths;
};

const getKebabCaseName = (sourcePath: string) =>
  kebabCase(path.basename(path.dirname(sourcePath)));

export default (options: RemaxOptions, adapter: Adapter) => () => ({
  visitor: {
    JSXElement(nodePath: NodePath, state: any) {
      const importer = state.file.opts.filename;
      const node = nodePath.node as t.JSXElement;

      if (t.isJSXIdentifier(node.openingElement.name)) {
        const tagName = node.openingElement.name.name;
        const binding = nodePath.scope.getBinding(tagName);
        if (!binding) {
          return;
        }
        const componentPath = binding.path;

        if (
          !componentPath ||
          !t.isImportDefaultSpecifier(componentPath.node) ||
          !t.isImportDeclaration(componentPath.parent)
        ) {
          return;
        }

        const source = componentPath.parent.source.value;

        let sourcePath = path.join(
          path.dirname(importer),
          componentPath.parent.source.value
        );

        const extname = path.extname(sourcePath);

        if (!extname) {
          sourcePath = path.join(sourcePath, 'index.js');
        } else if (extname !== '.js') {
          return;
        }

        // node_module native components
        if (!fs.existsSync(sourcePath)) {
          sourcePath = path.join(
            options.cwd,
            'node_modules',
            source,
            'index.js'
          );
        }

        if (!fs.existsSync(sourcePath)) {
          return;
        }

        if (!isNativeComponent(sourcePath)) {
          return;
        }

        const id = getKebabCaseName(sourcePath);

        const usedProps = node.openingElement.attributes.map(e => {
          const propName = get(e, 'name.name') as string;
          return propName;
        });

        const props = usedProps
          .filter(prop => !!prop)
          .map(prop => adapter.getNativePropName(prop, true));

        if (!nativeComponents[sourcePath]) {
          nativeComponents[sourcePath] = {
            type: id,
            id: `${id}-${++nativeId}`,
            props,
          };
        }

        props.forEach(prop => {
          if (nativeComponents[sourcePath].props.includes(prop)) {
            return;
          }

          nativeComponents[sourcePath].props.push(prop);
        });
      }
    },
    Program(nodePath: NodePath<t.Program>, state: any) {
      const sourcePath = state.file.opts.filename;

      const isNative = isNativeComponent(sourcePath);

      if (!isNative) {
        return;
      }

      const jsHelpers = collectJsHelper(sourcePath, adapter);
      const usingComponents = collectUsingComponents(sourcePath);

      const imports = jsHelpers
        .concat(usingComponents)
        .filter(source => source !== sourcePath)
        .map(key => `import '${key}';`)
        .join('');

      const importStr = `import React from 'react'; ${imports}`;
      let exportStr = 'export default {};';

      if (nativeComponents[sourcePath]) {
        exportStr = `export default (props) => {
          return React.createElement('${nativeComponents[sourcePath].id}', props, props.children);
        };`;
      }

      const importTemplate = template.ast(importStr);
      const exportTemplate = template.ast(exportStr);

      nodePath.node.body = nodePath.node.body.filter(node => {
        return !t.isExportDefaultDeclaration(node);
      });

      if (Array.isArray(importTemplate)) {
        nodePath.node.body = [...importTemplate, ...nodePath.node.body];
      } else {
        nodePath.node.body = [importTemplate, ...nodePath.node.body];
      }

      nodePath.node.body.push(exportTemplate as t.ExportDefaultDeclaration);
    },
  },
});

export function getNativeComponents() {
  return nativeComponents;
}

export function getUsingComponents() {
  return usingComponents;
}

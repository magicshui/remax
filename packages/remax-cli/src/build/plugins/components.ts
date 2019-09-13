import * as t from '@babel/types';
import { NodePath } from '@babel/traverse';
import { get } from 'dot-prop';
import { kebabCase } from 'lodash';
import { Adapter } from '../adapters';

interface Component {
  type: string;
  id: string;
  props: string[];
  children?: Component[];
}

const components: { [id: string]: Component } = {};

function shouldRegisterAllProps(
  adapter: Adapter,
  node: t.JSXElement,
  componentName: string
) {
  if (adapter.name === 'alipay') {
    return true;
  }

  if (
    node.openingElement.attributes.find(a => a.type === 'JSXSpreadAttribute')
  ) {
    return true;
  }

  return false;
}

export default (adapter: Adapter) => () => ({
  visitor: {
    JSXElement(path: NodePath) {
      const node = path.node as t.JSXElement;
      if (t.isJSXIdentifier(node.openingElement.name)) {
        const tagName = node.openingElement.name.name;
        const binding = path.scope.getBinding(tagName);
        if (!binding) {
          return;
        }
        const componentPath = get(binding, 'path') as NodePath;
        if (
          !componentPath ||
          !t.isImportSpecifier(componentPath.node) ||
          !t.isImportDeclaration(componentPath.parent) ||
          !componentPath.parent.source.value.startsWith('remax/')
        ) {
          return;
        }

        const componentName = componentPath.node.imported.name;
        const id = kebabCase(componentName);

        if (id === 'swiper-item') {
          return;
        }

        if (adapter.name === 'alipay' && id === 'picker-view-column') {
          return;
        }

        let usedProps = adapter.hostComponents(id).props;

        if (!shouldRegisterAllProps(adapter, node, componentName)) {
          usedProps = node.openingElement.attributes.map(e => {
            const propName = get(e, 'name.name') as string;
            return propName;
          });
        }

        const props = usedProps
          .filter(prop => !!prop)
          .map(prop => adapter.getNativePropName(prop as string));

        if (!components[id]) {
          components[id] = {
            type: kebabCase(componentName),
            id,
            props,
          };
        }

        props.forEach(prop => {
          if (components[id].props.includes(prop)) {
            return;
          }

          components[id].props.push(prop);
        });
      }
    },
  },
});

export function getComponents() {
  return Object.values(components);
}

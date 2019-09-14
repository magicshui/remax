import * as path from 'path';
import { parse } from 'acorn';
import { Plugin, OutputChunk } from 'rollup';
import { getComponents } from './components';
import ejs from 'ejs';
import { RemaxOptions } from '../../getConfig';
import readManifest from '../../readManifest';
import getEntries from '../../getEntries';
import { Adapter } from '../adapters';
import { Context } from '../../types';
import winPath from '../../winPath';
import { getNativeComponents } from './nativeComponents/babelPlugin';

async function createTemplate(
  pageFile: string,
  adapter: Adapter,
  options: RemaxOptions
) {
  const fileName = `${path.dirname(pageFile)}/${path.basename(
    pageFile,
    path.extname(pageFile)
  )}${adapter.extensions.template}`;

  const renderOptions: { [props: string]: any } = {
    baseTemplate: winPath(
      path.relative(
        path.dirname(pageFile),
        `base${adapter.extensions.template}`
      )
    ),
  };

  if (adapter.extensions.jsHelper) {
    renderOptions.jsHelper = winPath(
      path.relative(
        path.dirname(pageFile),
        `helper${adapter.extensions.jsHelper}`
      )
    );
  }

  const components = getComponents();
  const nativeComponents = Object.values(getNativeComponents());

  const code: string = await ejs.renderFile(adapter.templates.page, {
    ...renderOptions,
    nativeComponents,
    components,
    depth: options.UNSAFE_wechatTemplateDepth,
  });

  return {
    fileName,
    isAsset: true as true,
    source: code,
  };
}

async function createHelperFile(adapter: Adapter) {
  if (!adapter.templates.jsHelper) {
    return null;
  }

  const code: string = await ejs.renderFile(adapter.templates.jsHelper, {
    target: adapter.name,
  });

  return {
    fileName: `helper${adapter.extensions.jsHelper}`,
    isAsset: true as const,
    source: code,
  };
}

async function createBaseTemplate(adapter: Adapter, options: RemaxOptions) {
  // 支付宝小程序在 base.axml 使用不了原生小程序
  if (!adapter.templates.base) {
    return null;
  }

  const components = getComponents();
  const nativeComponents = Object.values(getNativeComponents());

  let code: string = await ejs.renderFile(
    adapter.templates.base,
    {
      components,
      nativeComponents,
      depth: options.UNSAFE_wechatTemplateDepth,
    },
    {
      // uglify
      rmWhitespace: process.env.NODE_ENV === 'production',
    }
  );

  // uglify
  if (process.env.NODE_ENV === 'production') {
    code = code.replace(/^\s*$(?:\r\n?|\n)/gm, '').replace(/\r\n|\n/g, ' ');
  }

  return {
    fileName: `base${adapter.extensions.template}`,
    isAsset: true as true,
    source: code,
  };
}

function createAppManifest(
  options: RemaxOptions,
  target: string,
  context?: Context
) {
  const config = context
    ? { ...context.app, pages: context.pages.map(p => p.path) }
    : readManifest(path.resolve(options.cwd, 'src/app.config.js'), target);
  return {
    fileName: 'app.json',
    isAsset: true as true,
    source: JSON.stringify(config, null, 2),
  };
}

function createPageUsingComponents(configFilePath: string) {
  const nativeComponents = getNativeComponents();
  const usingComponents: { [key: string]: string } = {};
  for (const [key, value] of Object.entries(nativeComponents)) {
    usingComponents[value.id] = path
      .relative(
        path.dirname(configFilePath),
        key.replace(/node_modules/, 'src/npm')
      )
      .replace(/\.js$/, '');
  }

  return usingComponents;
}

function createPageManifest(
  options: RemaxOptions,
  file: string,
  target: string,
  page: any,
  context?: Context
) {
  const configFile = file.replace(/\.(js|jsx|ts|tsx)$/, '.config.js');
  const manifestFile = file.replace(/\.(js|jsx|ts|tsx)$/, '.json');
  const configFilePath = path.resolve(
    options.cwd,
    path.join('src', configFile)
  );
  const usingComponents = createPageUsingComponents(configFilePath);
  const config = readManifest(configFilePath, target);
  config.usingComponents = {
    ...(config.usingComponents || {}),
    ...usingComponents,
  };

  if (context) {
    const pageConfig = context.pages.find((p: any) => p.path === page.path);
    if (pageConfig) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { path, ...config } = pageConfig;
      config.usingComponents = {
        ...(config.usingComponents || {}),
        ...usingComponents,
      };
      return {
        fileName: manifestFile,
        isAsset: true as true,
        source: JSON.stringify(config, null, 2),
      };
    }
  }

  return {
    fileName: manifestFile,
    isAsset: true as true,
    source: JSON.stringify(config, null, 2),
  };
}

function isRemaxEntry(chunk: any): chunk is OutputChunk {
  if (!chunk.isEntry) {
    return false;
  }

  const ast: any = parse(chunk.code, {
    ecmaVersion: 6,
    sourceType: 'module',
  });

  return ast.body.every((node: any) => {
    // 检查是不是原生写法
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'CallExpression' &&
      node.expression.callee.type === 'Identifier' &&
      node.expression.callee.name === 'Page' &&
      node.expression.arguments.length > 0 &&
      node.expression.arguments[0].type === 'ObjectExpression'
    ) {
      return false;
    }

    return true;
  });
}

export default function template(
  options: RemaxOptions,
  adapter: Adapter,
  context?: Context
): Plugin {
  return {
    name: 'template',
    generateBundle: async (_, bundle) => {
      // app.json
      const manifest = createAppManifest(options, adapter.name, context);
      bundle[manifest.fileName] = manifest;

      const template = await createBaseTemplate(adapter, options);

      if (template) {
        bundle[template.fileName] = template;
      }

      const helperFile = await createHelperFile(adapter);

      if (helperFile) {
        bundle[helperFile.fileName] = helperFile;
      }

      const entries = getEntries(options, adapter, context);
      const { pages } = entries;

      const files = Object.keys(bundle);
      await Promise.all([
        files.map(async file => {
          const chunk = bundle[file];
          if (isRemaxEntry(chunk)) {
            const filePath = Object.keys(chunk.modules)[0];
            const page = pages.find(p => p.file === filePath);
            if (page) {
              const template = await createTemplate(file, adapter, options);
              bundle[template.fileName] = template;
              const config = await createPageManifest(
                options,
                file,
                adapter.name,
                page,
                context
              );

              if (config) {
                bundle[config.fileName] = config;
              }
            }
          }
        }),
      ]);
    },
  };
}

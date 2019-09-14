import { RollupOptions, RollupWarning } from 'rollup';
import path from 'path';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import babel from 'rollup-plugin-babel';
import url from 'rollup-plugin-url';
import json from 'rollup-plugin-json';
import postcss from '@meck/rollup-plugin-postcss';
import postcssUrl from './plugins/postcssUrl';
import progress from 'rollup-plugin-progress';
import clean from 'rollup-plugin-delete';
import alias from 'rollup-plugin-alias';
import inject from 'rollup-plugin-inject';
import copy from 'rollup-plugin-copy';
import stub from './plugins/stub';
import pxToUnits from '@remax/postcss-px2units';
import getEntries from '../getEntries';
import getCssModuleConfig from '../getCssModuleConfig';
import template from './plugins/template';
import components from './plugins/components';
import page from './plugins/page';
import removeSrc from './plugins/removeSrc';
import removeConfig from './plugins/removeConfig';
import rename from './plugins/rename';
import replace from 'rollup-plugin-replace';
import { RemaxOptions } from '../getConfig';
import app from './plugins/app';
import removeESModuleFlag from './plugins/removeESModuleFlag';
import adapters, { Adapter } from './adapters';
import { Context, Env } from '../types';
import namedExports from 'named-exports-db';
import fixRegeneratorRuntime from './plugins/fixRegeneratorRuntime';
import nativeComponents from './plugins/nativeComponents/index';
import nativeComponentsBabelPlugin from './plugins/nativeComponents/babelPlugin';

export default function rollupConfig(
  options: RemaxOptions,
  argv: any,
  adapter: Adapter,
  context?: Context
) {
  const babelConfig = {
    presets: [
      require.resolve('@babel/preset-typescript'),
      require.resolve('@babel/preset-env'),
    ],
    plugins: [
      require.resolve('@babel/plugin-proposal-class-properties'),
      require.resolve('@babel/plugin-proposal-object-rest-spread'),
      require.resolve('@babel/plugin-syntax-jsx'),
      [
        require.resolve('@babel/plugin-proposal-decorators'),
        {
          decoratorsBeforeExport: true,
        },
      ],
    ],
  };

  const stubModules: string[] = [];

  adapters.forEach(name => {
    if (adapter.name !== name) {
      const packageName = `remax/lib/adapters/${name}`;
      stubModules.push(packageName);
    }
  });

  const entries = getEntries(options, adapter, context);
  const cssModuleConfig = getCssModuleConfig(options.cssModules);
  const aliasConfig = Object.entries(options.alias || {}).reduce(
    (config, [key, value]) => {
      config[key] = value.match(/^(\.|[^/])/)
        ? path.resolve(options.cwd, value)
        : value;
      return config;
    },
    {} as any
  );

  const envReplacement: Env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    REMAX_PLATFORM: argv.target,
    REMAX_DEBUG: process.env.REMAX_DEBUG,
  };

  Object.keys(process.env).forEach(k => {
    if (k.startsWith('REMAX_APP_')) {
      envReplacement[`${k}`] = process.env[k];
    }
  });

  const plugins = [
    copy({
      targets: [
        {
          src: ['src/native/*'],
          dest: 'dist',
        },
      ],
      copyOnce: true,
    }),
    alias({
      resolve: [
        '',
        '.ts',
        '.js',
        '.tsx',
        '.jsx',
        '/index.js',
        '/index.jsx',
        '/index.ts',
        '/index.tsx',
      ],
      '@': path.resolve(options.cwd, 'src'),
      ...aliasConfig,
    }),
    url({
      limit: 0,
      fileName: '[dirname][name][extname]',
      publicPath: '/',
      include: ['**/*.svg', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif'],
    }),
    resolve({
      dedupe: [
        'react',
        'object-assign',
        'prop-types',
        'scheduler',
        'react-reconciler',
      ],
      extensions: ['.mjs', '.js', '.jsx', '.json', '.ts', '.tsx'],
      customResolveOptions: {
        moduleDirectory: 'node_modules',
      },
    }),
    commonjs({
      include: /node_modules/,
      namedExports,
      extensions: [
        '.mjs',
        '.js',
        '.jsx',
        '.json',
        '.ts',
        '.tsx',
        adapter.extensions.jsHelper || '',
      ],
      ignoreGlobal: false,
    }),
    stub({
      modules: stubModules,
    }),
    babel({
      include: entries.pages.map(p => p.file),
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [
        nativeComponentsBabelPlugin(options, adapter),
        page,
        ...babelConfig.plugins,
      ],
      presets: babelConfig.presets,
    }),
    babel({
      include: entries.app,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [
        nativeComponentsBabelPlugin(options, adapter),
        app,
        ...babelConfig.plugins,
      ],
      presets: babelConfig.presets,
    }),
    babel({
      babelrc: false,
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      plugins: [
        nativeComponentsBabelPlugin(options, adapter),
        components(adapter),
        ...babelConfig.plugins,
      ],
      presets: babelConfig.presets.concat([
        require.resolve('@babel/preset-react'),
      ]),
    }),
    postcss({
      extract: true,
      modules: cssModuleConfig,
      plugins: [pxToUnits(), postcssUrl(options)],
    }),
    json({}),
    replace({
      values: {
        'process.env': JSON.stringify(envReplacement),
      },
    }),
    rename({
      include: 'src/**',
      map: input => {
        if (!input) {
          return input;
        }

        input = input
          .replace(/^demo\/src\//, '')
          // typescript
          .replace(/\.ts$/, '.js')
          .replace(/\.tsx$/, '.js')
          // image
          .replace(/\.png$/, '.png.js')
          .replace(/\.gif$/, '.gif.js')
          .replace(/\.svg$/, '.svg.js')
          .replace(/\.jpeg$/, '.jpeg.js')
          .replace(/\.jpg$/, '.jpg.js');

        // 不启用 css module 的 css 文件以及 app.css
        if (
          cssModuleConfig.globalModulePaths.some(reg => reg.test(input)) ||
          input.indexOf('app.css') !== -1
        ) {
          return input.replace(/\.css/, adapter.extensions.style);
        }

        return input.replace(/\.css/, '.css.js');
      },
    }),
    inject({
      exclude: 'node_modules/**',
      regeneratorRuntime: 'regenerator-runtime',
    }),
    rename({
      matchAll: true,
      map: input => {
        let replaceInput =
          input &&
          input
            // npm 包可能会有 jsx
            .replace(/\.jsx$/, '.js')
            // npm 包里可能会有 css
            .replace(/\.less$/, '.less.js')
            .replace(/\.sass$/, '.sass.js')
            .replace(/\.scss$/, '.scss.js')
            .replace(/\.styl$/, '.styl.js')
            .replace(/node_modules/g, 'npm')
            .replace(/\.js_commonjs-proxy$/, '.js_commonjs-proxy.js');

        if (envReplacement.REMAX_PLATFORM === 'alipay') {
          replaceInput = replaceInput.replace(/@/g, '_');
        }

        return replaceInput;
      },
    }),
    removeSrc({}),
    removeConfig(),
    removeESModuleFlag(),
    fixRegeneratorRuntime(),
    template(options, adapter, context),
    nativeComponents(options, adapter),
  ];

  if (options.progress) {
    plugins.push(progress());
  }

  if (process.env.NODE_ENV === 'production') {
    plugins.unshift(
      clean({
        targets: ['dist/*', '!.tea'],
      })
    );
  }

  const config: RollupOptions = {
    input: [entries.app, ...entries.pages.map(p => p.file), ...entries.images],
    output: {
      dir: options.output,
      format: adapter.moduleFormat,
      exports: 'named',
      sourcemap: false,
      extend: true,
    },
    preserveModules: true,
    preserveSymlinks: true,
    onwarn(warning, warn) {
      if ((warning as RollupWarning).code === 'THIS_IS_UNDEFINED') return;
      if ((warning as RollupWarning).code === 'CIRCULAR_DEPENDENCY') return;
      warn(warning);
    },
    plugins,
  };

  return config;
}

import * as rollup from 'rollup';
import esm from 'esm';
import rollupConfig from './rollupConfig';
import getConfig from '../getConfig';
import { Context } from '../types';
import runWatcher from './watcher';
import { output } from './utils/output';

// eslint-disable-next-line
require = esm(module, {
  cjs: {
    dedefault: true,
  },
});

export default async (argv: any, context?: Context) => {
  const options = {
    ...getConfig(),
    ...(context ? context.config : {}),
  };

  let targetConfig;
  try {
    targetConfig = require(`./adapters/${argv.target}`);
  } catch (e) {
    throw new Error(`Target ${argv.target} is not supported yet.`);
  }

  const rollupOptions: rollup.RollupOptions = rollupConfig(
    options,
    argv,
    targetConfig,
    context
  );

  if (argv.watch) {
    runWatcher(rollupOptions, argv, context);
  } else {
    try {
      output('🚀 开始 build...', 'blue');
      const bundle = await rollup.rollup(rollupOptions);
      await bundle.write(rollupOptions.output!);
      output('💡 完成', 'green');
    } catch (error) {
      const name = error.code === 'PLUGIN_ERROR' ? error.plugin : error.code;
      output(`\n🚨 [${name}]: ${error.message}`, 'red');
      throw error;
    }
  }
};

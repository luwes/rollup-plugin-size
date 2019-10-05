const path = require('path');
const SizePluginCore = require('size-plugin-core');

const defaults = {
  gzip: true,
  brotli: false,
  pattern: '**/*.{mjs,js,jsx,css,html}',
  exclude: undefined,
  writeFile: true,
  publish: false
};
/**
 * Size Plugin for Rollup
 * @param {Object} options
 * @param {string} [options.gzip] use gzip compression for files
 * @param {string} [options.brotli] use brotli compression for files
 * @param {string} [options.pattern] minimatch pattern of files to track
 * @param {string} [options.exclude] minimatch pattern of files NOT to track
 * @param {string} [options.filename] file name to save filesizes to disk
 * @param {boolean} [options.publish] option to publish filesizes to size-plugin-store
 * @param {boolean} [options.writeFile] option to save filesizes to disk
 */
function bundleSize(options) {
  const coreOptions = Object.assign(defaults, options);
  coreOptions.compression = coreOptions.brotli ? 'brotli' : 'gzip';
  const core = new SizePluginCore(coreOptions);

  async function generateBundle(outputOptions, bundle) {
    try {
      const assets = Object.keys(bundle).reduce((agg, key) => {
        agg[key] = {
          source: bundle[key].code
        };
        return agg;
      }, {});

      const outputPath = outputOptions.dir
        ? path.resolve(outputOptions.dir)
        : path.dirname(outputOptions.file);

      if (outputOptions.file) {
        core.options.pattern = Object.keys(assets).pop();
      }

      let output = await core.execute(assets, outputPath);
      if (output) {
        if (outputOptions.file) {
          // Remove newline for single file output.
          output = output.trimRight();
        }
        console.log(output);
      }
    } catch (error) {
      console.error(error);
    }
  }
  return {
    name: 'rollup-plugin-size',
    generateBundle
  };
}

module.exports = bundleSize;

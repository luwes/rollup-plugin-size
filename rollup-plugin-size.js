const path = require('path');
const core = require('size-plugin-core');

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
function bundleSize(_options) {

  const coreOptions = Object.assign(defaults, _options);
  coreOptions.compression=coreOptions.brotli?'brotli':'gzip';

  const { outputSizes } = core(_options);
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
      const output = await outputSizes(assets, outputPath);
      output && console.log('\n' + output);
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

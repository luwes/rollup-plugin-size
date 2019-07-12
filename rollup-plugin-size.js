/**
 * Copyright 2018 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

const path = require('path');
const chalk = require('chalk');
const { promisify } = require('util');
const globPromise = require('glob');
const minimatch = require('minimatch');
const gzipSize = require('gzip-size');
const brotliSize = require('brotli-size');
const prettyBytes = require('pretty-bytes');
const { toMap, dedupe } = require('./utils.js');
const glob = promisify(globPromise);

brotliSize.file = (path, options) => {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(path);
    stream.on('error', reject);

    const brotliStream = stream.pipe(brotliSize.stream(options));
    brotliStream.on('error', reject);
    brotliStream.on('brotli-size', resolve);
  });
};


const defaults = {
  gzip: true,
  brotli: false,
  pattern: '**/*.{mjs,js,css,html}',
  exclude: undefined,
  columnWidth: 20
};

function bundleSize(options) {
  const { pattern, exclude, columnWidth, brotli } = Object.assign(defaults, options);

  let max = '';
  let firstTime = true;
  let initialSizes;

  const compressionSize = brotli ? brotliSize : gzipSize;

  function buildStart() {
    max = '';
  }

  function renderChunk(code) {
    max = max += code;
    return null;
  }

  async function generateBundle(outputOptions, bundle) {
    if (firstTime) {
      firstTime = false;
      initialSizes = await getSizes(path.dirname(outputOptions.file));
    }
    outputSizes(bundle).catch(console.error);
  }

  async function outputSizes(assets) {
    // map of filenames to their previous size
    const sizesBefore = await Promise.resolve(initialSizes);
    const isMatched = minimatch.filter(pattern);
    const isExcluded = exclude ? minimatch.filter(exclude) : () => false;
    const assetNames = Object.keys(assets).filter(
      file => isMatched(file) && !isExcluded(file)
    );
    const sizes = await Promise.all(
      assetNames.map(name => compressionSize(assets[name].code))
    );

    // map of de-hashed filenames to their final size
    initialSizes = toMap(assetNames, sizes);

    // get a list of unique filenames
    const files = Object.keys(initialSizes).filter(dedupe);

    const width = Math.max(...files.map(file => file.length));
    let output = '';
    for (const name of files) {
      const size = initialSizes[name] || 0;
      const delta = size - (sizesBefore[name] || 0);
      const msg =
        new Array(
          (width !== name.length ? width : columnWidth) - name.length + 2
        ).join(' ') +
        name +
        ' ⏤  ';
      const color =
        size > 100 * 1024
          ? 'red'
          : size > 40 * 1024
          ? 'yellow'
          : size > 20 * 1024
          ? 'cyan'
          : 'green';
      let sizeText = chalk[color](prettyBytes(size));
      if (delta) {
        let deltaText = (delta > 0 ? '+' : '') + prettyBytes(delta);
        if (delta > 1024) {
          sizeText = chalk.bold(sizeText);
          deltaText = chalk.red(deltaText);
        } else if (delta < -10) {
          deltaText = chalk.green(deltaText);
        }
        sizeText += ` (${deltaText})`;
      }
      output += msg + sizeText;
    }
    if (output) {
      console.log(output);
    }
  }

  async function getSizes(cwd) {
    const files = await glob(pattern, { cwd, ignore: exclude });

    const sizes = await Promise.all(
      files.map(file => compressionSize.file(path.join(cwd, file)).catch(() => null))
    );

    return toMap(files, sizes);
  }

  return {
    name: 'rollup-plugin-size',
    buildStart,
    renderChunk,
    generateBundle
  };
}

module.exports = bundleSize;

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
const fs = require('fs-extra');
const { toMap, dedupe, toFileMap } = require('./utils.js');
const { publishSizes, publishDiff } = require('./publish-size');
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
  pattern: '**/*.{mjs,js,jsx,css,html}',
  exclude: undefined,
  writeFile:true,
  publish:false,
  columnWidth: 20
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
  const options = Object.assign(defaults, _options);
  const { pattern, exclude, brotli } = options;
  options.filename = options.filename || 'size-plugin.json';
  const filename = path.join(process.cwd(), options.filename);
  let initialSizes;

  const compressionSize = brotli ? brotliSize : gzipSize;

  async function generateBundle(outputOptions, bundle) {
    initialSizes = await load(path.resolve(outputOptions.dir));
    outputSizes(bundle).catch(console.error);
  }
  function filterFiles(files) {
    const isMatched = minimatch.filter(pattern);
    const isExcluded = exclude ? minimatch.filter(exclude) : () => false;
    return files.filter(file => isMatched(file) && !isExcluded(file));
  }
  async function readFromDisk(filename) {
    try {
      await fs.ensureFile(filename);
      const oldStats = await fs.readJSON(filename);
      return oldStats.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      return [];
    }
  }
  async function writeToDisk(filename, stats) {
    if (
      process.env.NODE_ENV === 'production' &&
      stats.files.some(file => file.diff !== 0)
    ) {
      const data = await readFromDisk(filename);
      data.unshift(stats);
      if(options.writeFile){
        await fs.ensureFile(filename);
        await fs.writeJSON(filename, data);
      }
      options.publish && await publishSizes(data, options.filename);
    }
  }
  async function save(files) {
    const stats = {
      timestamp: Date.now(),
      files: files.map(file => ({
        filename: file.name,
        previous: file.sizeBefore,
        size: file.size,
        diff: file.size - file.sizeBefore
      }))
    };
    options.publish && await publishDiff(stats, options.filename);
    options.save && (await options.save(stats));
    await writeToDisk(filename, stats);
  }
  async function load(outputPath) {

    const data = await readFromDisk(filename);
    if (data.length) {
      const [{ files }] = data;
      return toFileMap(files);
    }
    return getSizes(outputPath);
  }
  async function outputSizes(assets) {
    const sizesBefore = await Promise.resolve(initialSizes);
    const assetNames = filterFiles(Object.keys(assets));
    const sizes = await Promise.all(
      assetNames.map(name => compressionSize(assets[name].code))
    );

    // map of de-hashed filenames to their final size
    const sizesAfter = toMap(assetNames, sizes);

    // get a list of unique filenames
    const files = [
      ...Object.keys(sizesBefore),
      ...Object.keys(sizesAfter)
    ].filter(dedupe);

    const width = Math.max(...files.map(file => file.length));
    let output = '';
    const items = [];

    for (const name of files) {
      const size = sizesAfter[name] || 0;
      const sizeBefore = sizesBefore[name] || 0;
      const delta = size - sizeBefore;
      const msg = new Array(width - name.length + 2).join(' ') + name + ' ⏤  ';
      const color =
        size > 100 * 1024
          ? 'red'
          : size > 40 * 1024
          ? 'yellow'
          : size > 20 * 1024
          ? 'cyan'
          : 'green';
      let sizeText = chalk[color](prettyBytes(size));
      let deltaText = '';
      if (delta && Math.abs(delta) > 1) {
        deltaText = (delta > 0 ? '+' : '') + prettyBytes(delta);
        if (delta > 1024) {
          sizeText = chalk.bold(sizeText);
          deltaText = chalk.red(deltaText);
        } else if (delta < -10) {
          deltaText = chalk.green(deltaText);
        }
        sizeText += ` (${deltaText})`;
      }
      const text = msg + sizeText + '\n';
      const item = {
        name,
        sizeBefore,
        size,
        sizeText,
        delta,
        deltaText,
        msg,
        color
      };
      items.push(item);

      output += text;
    }

    await save(items);
    output && console.log('\n' + output);
  }

  async function getSizes(cwd) {
    const files = await glob(pattern, { cwd, ignore: exclude });

    const sizes = await Promise.all(
      filterFiles(files).map(file =>
        compressionSize.file(path.join(cwd, file)).catch(() => null)
      )
    );

    return toMap(files, sizes);
  }

  return {
    name: 'rollup-plugin-size',
    generateBundle
  };
}

module.exports = bundleSize;

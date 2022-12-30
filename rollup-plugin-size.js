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

import path from 'path';
import chalk from 'chalk';
import { promisify } from 'util';
import globPromise from 'glob';
import minimatch from 'minimatch';
import zlib from 'zlib';
import prettyBytes from 'pretty-bytes';
import fs from 'fs-extra';
import { toMap, dedupe, toFileMap } from './utils.js';
import { publishSizes, publishDiff } from './publish-size.js';
const glob = promisify(globPromise);

const GZIP_OPTS = {
  level: 9
};
const BROTLI_OPTS = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY
  }
};

const defaults = {
  compression: 'gzip',
  pattern: '**/*.{mjs,js,jsx,css,html}',
  exclude: undefined,
  writeFile: true,
  publish: false,
  columnWidth: 20
};
/**
 * Size Plugin for Rollup
 * @param {Object} options
 * @param {'none' | 'gzip' | 'brotli'} [options.compression = 'gzip'] change the compression algorithm used for calculated sizes
 * @param {string} [options.pattern] minimatch pattern of files to track
 * @param {string} [options.exclude] minimatch pattern of files NOT to track
 * @param {string} [options.filename] file name to save filesizes to disk
 * @param {boolean} [options.publish] option to publish filesizes to size-plugin-store
 * @param {boolean} [options.writeFile] option to save filesizes to disk
 */
function bundleSize(_options) {
  const options = Object.assign(defaults, _options);
  let { pattern, exclude, compression } = options;
  options.filename = options.filename || 'size-plugin.json';
  const filename = path.join(process.cwd(), options.filename);
  let initialSizes;
  let isSingleChunk;

  async function generateBundle(outputOptions, bundle) {
    const _path = outputOptions.dir
      ? path.resolve(outputOptions.dir)
      : path.dirname(outputOptions.file);

    let chunks = Object.values(bundle)
      .filter((outputFile) => outputFile.type === 'chunk');
    isSingleChunk = chunks.length === 1;
    if (isSingleChunk) {
      pattern = chunks[0].fileName;
    }

    initialSizes = await load(_path);
    outputSizes(bundle).catch(console.error);
  }

  async function load(outputPath) {
    const data = await readFromDisk(filename);
    if (data.length) {
      const [{ files }] = data;
      return toFileMap(files);
    }
    return getSizes(outputPath);
  }

  async function readFromDisk(filename) {
    try {
      if (!options.writeFile) {
        return [];
      }
      const oldStats = await fs.readJSON(filename);
      return oldStats.sort((a, b) => b.timestamp - a.timestamp);
    } catch (err) {
      return [];
    }
  }

  async function getSizes(cwd) {
    const files = await glob(pattern, { cwd, ignore: exclude });

    const sizes = await Promise.all(
      filterFiles(files).map(async file => {
        const source = await fs.promises.readFile(path.join(cwd, file)).catch(() => null);
        if (source == null) return null;
        return getCompressedSize(source);
      })
    );

    return toMap(files, sizes);
  }

  async function getCompressedSize(source) {
    let compressed = source;
    if (compression === 'gzip') {
      const gz = promisify(zlib.gzip);
      compressed = await gz(source, GZIP_OPTS);
    }
    else if (compression === 'brotli') {
      if (!zlib.brotliCompress) throw Error('Brotli not supported in this Node version.');
      const br = promisify(zlib.brotliCompress);
      compressed = await br(source, BROTLI_OPTS);
    }
    return Buffer.byteLength(compressed);
  }

  function filterFiles(files) {
    const isMatched = minimatch.filter(pattern);
    const isExcluded = exclude ? minimatch.filter(exclude) : () => false;
    return files.filter(file => isMatched(file) && !isExcluded(file));
  }

  async function writeToDisk(filename, stats) {
    if (
      process.env.NODE_ENV === 'production' &&
      stats.files.some(file => file.diff !== 0)
    ) {
      const data = await readFromDisk(filename);
      data.unshift(stats);
      if (options.writeFile) {
        await fs.ensureFile(filename);
        await fs.writeJSON(filename, data);
      }
      options.publish && (await publishSizes(data, options.filename));
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
    options.publish && (await publishDiff(stats, options.filename));
    options.save && (await options.save(stats));
    await writeToDisk(filename, stats);
  }

  async function outputSizes(assets) {
    const sizesBefore = await Promise.resolve(initialSizes);
    const assetNames = filterFiles(Object.keys(assets));
    const sizes = await Promise.all(
      assetNames.map(name => getCompressedSize(assets[name].code))
    );

    // map of de-hashed filenames to their final size
    const sizesAfter = toMap(assetNames, sizes);

    // get a list of unique filenames
    const files = [
      ...Object.keys(sizesBefore),
      ...Object.keys(sizesAfter)
    ].filter(dedupe);

    const width = Math.max(...files.map(file => file.length), defaults.columnWidth || 0);
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

    if (output) {
      if (isSingleChunk) {
        // Remove newline for single file output.
        output = output.trimRight();
      }
      console.log(output);
    }
  }

  return {
    name: 'rollup-plugin-size',
    generateBundle
  };
}

export default bundleSize;

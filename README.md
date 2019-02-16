<p align="center">
  <h1 align="center">
    rollup-plugin-size
    <a href="https://www.npmjs.org/package/rollup-plugin-size"><img src="https://img.shields.io/npm/v/rollup-plugin-size.svg?style=flat" alt="npm"></a>
  </h1>
</p>

<p align="center">
  Prints the gzipped sizes of your rollup assets and the changes since the last build.
</p>


## Installation

Install `rollup-plugin-size` as a development dependency using npm:

```sh
npm i -D rollup-plugin-size
```

---

## Usage

Add the plugin to your rollup configuration:

```diff
// rollup.config.js
+ import size from 'rollup-plugin-size';

plugins: [
+   size()
]
```

---

## License

[Apache 2.0](LICENSE)

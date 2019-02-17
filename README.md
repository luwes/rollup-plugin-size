<p align="center">
  <h1 align="center">
    rollup-plugin-size
    <a href="https://www.npmjs.org/package/rollup-plugin-size"><img src="https://img.shields.io/npm/v/rollup-plugin-size.svg?style=flat&v1" alt="npm"></a>
  </h1>
</p>

<p align="center">
  Prints the gzipped sizes of your rollup assets and the changes since the last build.
</p>

<p align="center">
  <img src="https://i.imgur.com/SE1mlK2.png" width="602" alt="rollup-plugin-size">
</p>

> 🙋 Using Webpack? Check out the original [size-plugin](https://github.com/GoogleChromeLabs/size-plugin).

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

## Credits

This is a port of [size-plugin](https://github.com/GoogleChromeLabs/size-plugin) by [Jason Miller](https://github.com/developit).

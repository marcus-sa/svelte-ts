# Svelte TS

[![asciicast](https://asciinema.org/a/273360.svg)](https://asciinema.org/a/273360)

#### Features
* Generation of Svelte component declarations
* TypeScript support in template tags
* **(WIP)** Template type checking support
* **(TODO)** Sapper integration

## Bazel

#### Getting started
1. Setup the Node & TS installation for Bazel by following their [guide](https://bazelbuild.github.io/rules_nodejs/TypeScript.html).
2. Install the related Svelte packages
    ```sh
   $ yarn install svelte sapper
    ```
3. Install the `@svelte-ts/bazel` NPM package
    ```sh
   $ yarn install @svelte-ts/bazel
    ```

#### Rules
> For further usage take a look in the [test](https://github.com/avantci/rules_svelte/tree/dev/test) directory
  
1. Compile TS & Svelte templates using `svelte_module`
```python
load("@npm_svelte_ts_bazel//:index.bzl", "svelte_module")

svelte_module(
    name = "app",
    srcs = [
        "main.ts",
        "App.svelte",
    ],
    deps = [
        "//some/other:dep",
    ],
)
```

## Rollup
TODO

## Webpack
TODO


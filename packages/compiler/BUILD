load("@npm_bazel_typescript//:index.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "compiler",
    srcs = glob(["**/*.ts"]),
    module_name = "@svelte-ts/compiler",
    deps = [
        "//packages/common",
        "@npm//@types",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

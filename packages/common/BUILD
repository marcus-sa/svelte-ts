load("@npm_bazel_typescript//:index.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "common",
    srcs = glob(["**/*.ts"]),
    module_name = "@svelte-ts/common",
    deps = [
        "@npm//@bazel/typescript",
        "@npm//@types",
        "@npm//svelte",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

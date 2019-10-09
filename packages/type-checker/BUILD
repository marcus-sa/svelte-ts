load("@build_bazel_rules_nodejs//:defs.bzl", "nodejs_binary", "npm_package")
load("@npm_bazel_typescript//:index.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "type-checker",
    srcs = glob(["**/*.ts"]),
    module_name = "@svelte-ts/type-checker",
    visibility = ["//visibility:public"],
    deps = [
        "//packages/common",
        "@npm//@bazel/typescript",
        "@npm//@types",
        "@npm//string-similarity",
        "@npm//svelte",
        "@npm//ts-simple-type",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

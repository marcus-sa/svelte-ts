load("@build_bazel_rules_nodejs//:defs.bzl", "nodejs_binary", "npm_package")
load("@npm_bazel_typescript//:index.bzl", "ts_library")

ts_library(
    name = "compiler_lib",
    srcs = glob(["**/*.ts"]),
    visibility = ["//visibility:public"],
    deps = [
        "@npm//@bazel/typescript",
        "@npm//@types",
        "@npm//svelte",
        "@npm//ts-simple-type",
        "@npm//tsickle",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

nodejs_binary(
    name = "compiler",
    configuration_env_vars = ["compile"],
    data = [":compiler_lib"],
    entry_point = ":main.ts",
    visibility = ["//visibility:public"],
)

filegroup(
    name = "package_assets",
    srcs = ["BUILD.bazel"],
    visibility = ["//src:__subpackages__"],
)

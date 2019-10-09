load("@build_bazel_rules_nodejs//:defs.bzl", "nodejs_binary", "npm_package")
load("@npm_bazel_typescript//:index.bzl", "ts_library")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "compiler_lib",
    srcs = glob(["**/*.ts"]),
    module_name = "@svelte-ts/compiler",
    visibility = ["//visibility:public"],
    deps = [
        "//packages/common",
        "//packages/type-checker",
        "@npm//@bazel/typescript",
        "@npm//@types",
        "@npm//svelte",
        "@npm//tsickle",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

nodejs_binary(
    name = "compiler",
    configuration_env_vars = ["compile"],
    data = [":compiler_lib"],
    entry_point = ":internal/main.ts",
    visibility = ["//visibility:public"],
)

filegroup(
    name = "package_assets",
    srcs = ["BUILD.bazel"],
    visibility = ["//src:__subpackages__"],
)

# For generating skydoc
exports_files(glob(["*.bzl"]))

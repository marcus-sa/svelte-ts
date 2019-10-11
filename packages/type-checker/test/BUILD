load("@npm_bazel_typescript//:index.bzl", "ts_library")
load("@build_bazel_rules_nodejs//:defs.bzl", "nodejs_binary")
load("@npm_bazel_jasmine//:index.bzl", "jasmine_node_test")

package(default_visibility = ["//visibility:public"])

ts_library(
    name = "test_lib",
    testonly = True,
    srcs = [
        "create-test-type-checker.ts",
        "svelte-type-checker.spec.ts",
    ],
    deps = [
        "//packages/common",
        "//packages/compiler",
        "//packages/type-checker",
        "@npm//@bazel/typescript",
        "@npm//@types",
        "@npm//memfs",
        "@npm//tslib",
        "@npm//typescript",
    ],
)

jasmine_node_test(
    name = "test",
    srcs = [":test_lib"],
    coverage = True,
)

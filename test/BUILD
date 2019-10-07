load("//packages/bazel-svelte:index.bzl", "svelte_module")
load("@build_bazel_rules_nodejs//:index.bzl", "rollup_bundle")

svelte_module(
    name = "app",
    srcs = glob([
        "*.svelte",
        "*.ts"
    ]),
    compiler = "//packages/bazel-svelte",
    deps = [
        "@npm//svelte",
        "//packages/bazel-svelte/test/Button",
    ],
)

rollup_bundle(
    name = "bundle",
    entry_point = ":main.ts",
    deps = [
        ":app"
    ],
)
load("//packages/bazel:index.bzl", "svelte_module")
load("@build_bazel_rules_nodejs//:index.bzl", "rollup_bundle")

svelte_module(
    name = "app",
    srcs = glob([
        "*.svelte",
        "*.ts",
    ]),
    compiler = "//packages/bazel:compiler",
    deps = [
        "//test/Alert",
        "@npm//svelte",
    ],
)

rollup_bundle(
    name = "bundle",
    entry_point = ":main.ts",
    deps = [
        ":app",
    ],
)

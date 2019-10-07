load("//packages/bazel-svelte:index.bzl", "svelte_module")

package(default_visibility = ["//packages/bazel-svelte:__subpackages__"])

svelte_module(
    name = "Button",
    srcs = glob([
        "*.svelte",
        "*.ts"
    ]),
    compiler = "//packages/bazel-svelte",
    deps = [
        "@npm//svelte",
    ],
)

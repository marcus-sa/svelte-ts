load("//:index.bzl", "svelte_module")

package(default_visibility = ["//test:__subpackages__"])

svelte_module(
    name = "Button",
    srcs = glob([
        "*.svelte",
        "*.ts",
    ]),
    compiler = "//src/compiler",
    deps = [
        "@npm//svelte",
    ],
)

load(
    "@npm_bazel_typescript//internal:common/compilation.bzl",
    "COMMON_ATTRIBUTES",
    "COMMON_OUTPUTS",
    "DEPS_ASPECTS",
    "compile_ts",
    "ts_providers_dict_to_struct",
)
load(
    "@build_bazel_rules_nodejs//internal/common:node_module_info.bzl",
    "NodeModuleSources",
    "collect_node_modules_aspect",
)
load(
    "@npm_bazel_typescript//internal:build_defs.bzl",
    "tsc_wrapped_tsconfig",
)
load(
    "@npm_bazel_typescript//internal:ts_config.bzl",
    "TsConfigInfo",
)

DEFAULT_SVELTE_COMPILER = "@npm//bazel-svelte/bin/compiler"

# Extra options passed to Node when running ngc.
_EXTRA_NODE_OPTIONS_FLAGS = [
    # Expose the v8 garbage collection API to JS.
    "--node_options=--expose-gc",
    # Show ~full stack traces, instead of cutt  ing off after 10 items.
    "--node_options=--stack-trace-limit=100",
    # Give 4 GB RAM to node to allow bigger google3 modules to compile.
    "--node_options=--max-old-space-size=4096",
]

def _svelte_tsconfig(ctx, files, srcs, **kwargs):
    outs = _expected_outs(ctx)
    if "devmode_manifest" in kwargs:
       expected_outs = outs.devmode_js + outs.declarations
    else:
       expected_outs = outs.closure_js

    svelte_compiler_options = {
        "expectedOuts": depset([o.path for o in expected_outs]).to_list(),
        "format": "esm",
    }

    return dict(tsc_wrapped_tsconfig(ctx, files, srcs, **kwargs), **{
        "svelteCompilerOptions": svelte_compiler_options,
#        "compilerOptions": {
#            "target": "es2015",
#            "module": "esnext",
#            "moduleResolution": "node",
#            "alwaysStrict": False,
#            "inlineSourceMap": False,
#            "sourceMap": True,
#            "allowNonTsExtensions": True,
#            "allowJs": True,
#        }
    })

def _expected_outs(ctx):
    devmode_js_files = []
    closure_js_files = []
    declaration_files = []

    for src in ctx.files.srcs:
        package_prefix = ctx.label.package + "/" if ctx.label.package else ""
        short_path = src.short_path if src.short_path[0:2] != ".." else "/".join(src.short_path.split("/")[2:])

        if short_path.endswith(".svelte"):
            basename = short_path[len(package_prefix):-len(".svelte")]
            devmode_js = [".svelte.js"]

        elif short_path.endswith(".ts") and not short_path.endswith("d.ts"):
            basename = short_path[len(package_prefix):-len(".ts")]
            devmode_js = [".js"]

        else:
            continue

        closure_js = [f.replace(".js", ".closure.js") for f in devmode_js]
        declarations = [f.replace(".js", ".d.ts") for f in devmode_js]

        devmode_js_files += [ctx.actions.declare_file(basename + ext) for ext in devmode_js]
        closure_js_files += [ctx.actions.declare_file(basename + ext) for ext in closure_js]
        declaration_files += [ctx.actions.declare_file(basename + ext) for ext in declarations]

    return struct(
        closure_js = closure_js_files,
        devmode_js = devmode_js_files,
        declarations = declaration_files,
    )

def _filter_ts_inputs(all_inputs):
    # The compiler only needs to see TypeScript sources from the npm dependencies,
    # but may need to look at package.json and ngsummary.json files as well.
    return [
        f
        for f in all_inputs
        if f.path.endswith(".js") or f.path.endswith(".ts") or f.path.endswith(".json") or f.path.endswith(".svelte")
    ]

def _prodmode_compile_action(ctx, inputs, outputs, tsconfig_file, node_opts):
    outs = _expected_outs(ctx)
    # compile_action_outputs = outputs + outs.devmode_js + outs.declarations
    return _compile_action(ctx, inputs, outputs + outs.closure_js, tsconfig_file, node_opts, "prod")

def _devmode_compile_action(ctx, inputs, outputs, tsconfig_file, node_opts):
    outs = _expected_outs(ctx)
    compile_action_outputs = outputs + outs.devmode_js + outs.declarations
    return _compile_action(ctx, inputs, compile_action_outputs, tsconfig_file, node_opts, "dev")

def _ts_expected_outs(ctx, label, srcs_files = []):
    # rules_typescript expects a function with two or more arguments, but our
    # implementation doesn't use the label(and **kwargs).
    _ignored = [label, srcs_files]
    return _expected_outs(ctx)

def _compile_action(ctx, inputs, outputs, tsconfig_file, node_opts, compile_mode):
    # Give the Angular compiler all the user-listed assets
    file_inputs = list(ctx.files.assets)

    if (type(inputs) == type([])):
        file_inputs.extend(inputs)
    else:
        file_inputs.extend(inputs.to_list())

    if hasattr(ctx.attr, "node_modules"):
        file_inputs.extend(_filter_ts_inputs(ctx.files.node_modules))

    # If the user supplies a tsconfig.json file, the Angular compiler needs to read it
    if hasattr(ctx.attr, "tsconfig") and ctx.file.tsconfig:
        file_inputs.append(ctx.file.tsconfig)
        if TsConfigInfo in ctx.attr.tsconfig:
            file_inputs += ctx.attr.tsconfig[TsConfigInfo].deps

    # Also include files from npm fine grained deps as action_inputs.
    # These deps are identified by the NodeModuleSources provider.
    for d in ctx.attr.deps:
        if NodeModuleSources in d:
            # Note: we can't avoid calling .to_list() on sources
            file_inputs.extend(_filter_ts_inputs(d[NodeModuleSources].sources.to_list()))

    return svelte_compile_action(ctx, file_inputs, outputs, tsconfig_file, node_opts, compile_mode)

def svelte_compile_action(ctx, inputs, outputs, tsconfig_file, node_opts, compile_mode):
    mnemonic = "SvelteCompile"
    progress_message = "Compiling Svelte templates (%s) %s" % (compile_mode, ctx.label)

    arguments = (list(_EXTRA_NODE_OPTIONS_FLAGS) + ["--node_options=%s" % opt for opt in node_opts])

#    supports_workers = str(int(ctx.attr._supports_workers))
#
#    if supports_workers == "1":
#        arguments += ["@@" + tsconfig_file.path]
#    else:
    arguments += ["-p", tsconfig_file.path]

    ctx.actions.run(
        progress_message = progress_message,
        mnemonic = mnemonic,
        inputs = inputs,
        outputs = outputs,
        arguments = arguments,
        executable = ctx.executable.compiler,
#        execution_requirements = {
#            "supports-workers": supports_workers,
#        },
    )

    return struct(
        label = ctx.label,
        tsconfig = tsconfig_file,
        inputs = inputs,
        outputs = outputs,
        compiler = ctx.executable.compiler,
    )

def svelte_module_impl(ctx):
    return compile_ts(
        ctx,
        is_library = True,
        compile_action = _prodmode_compile_action,
        devmode_compile_action = _devmode_compile_action,
        tsc_wrapped_tsconfig = _svelte_tsconfig,
        outputs = _ts_expected_outs,
    )

def _svelte_module_impl(ctx):
    return ts_providers_dict_to_struct(svelte_module_impl(ctx))

SVELTE_MODULE_ATTRS = dict(COMMON_ATTRIBUTES, **{
    "srcs": attr.label_list(allow_files = [".svelte", ".ts", ".html"]),
    "assets": attr.label_list(),
    "entry_point": attr.label(allow_single_file = True),
    "tsconfig": attr.label(allow_single_file = True),
    "node_modules": attr.label(
        default = Label("@npm//typescript:typescript__typings"),
    ),
    "css_compiler": attr.label(
        executable = True,
        cfg = "host",
    ),
    "compiler": attr.label(
        doc = """Sets a different ngc compiler binary to use for this library.
         The default ngc compiler depends on the `@npm//@angular/bazel`
         target which is setup for projects that use bazel managed npm deps that
         fetch the @angular/bazel npm package. It is recommended that you use
         the workspace name `@npm` for bazel managed deps so the default
         compiler works out of the box. Otherwise, you'll have to override
         the compiler attribute manually.
         """,
        default = Label(DEFAULT_SVELTE_COMPILER),
        executable = True,
        cfg = "host",
    ),
    "_supports_workers": attr.bool(default = True),
})

svelte_module = rule(
    implementation = _svelte_module_impl,
    outputs = COMMON_OUTPUTS,
    attrs = SVELTE_MODULE_ATTRS,
)

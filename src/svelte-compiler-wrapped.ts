// Inspired by https://github.com/angular/angular/blob/0119f46daf8f1efda00f723c5e329b0c8566fe07/packages/bazel/src/ngc-wrapped/index.ts

import * as ts from 'typescript';
import { compile } from 'svelte/compiler';
import { CompileOptions } from 'svelte/types/compiler/interfaces';
import * as fs from 'fs';
import * as tsickle from 'tsickle';
import * as path from 'path';
import {
  runAsWorker,
  runWorkerLoop,
  parseTsconfig,
  debug,
  FileCache,
  BazelOptions,
  CompilerHost,
  CachedFileLoader,
  resolveNormalizedPath,
  constructManifest,
  UncachedFileLoader,
  FileLoader,
} from '@bazel/typescript';

/** The one FileCache instance used in this process. */
const fileCache = new FileCache<ts.SourceFile>(debug);

const BAZEL_BIN = /\b(blaze|bazel)-out\b.*?\bbin\b/;
const SVELTE_JS_EXT = /(.svelte.js)$/g;
const SCRIPT_TAG = /<script(\s[^]*?)?>([^]*?)<\/script>/gi;

export interface SvelteCompilerOptions extends CompileOptions {
  expectedOuts: string[];
}

interface SvelteCompileOptions extends Pick<SvelteCompilerOptions, 'expectedOuts'> {
  tsHost: ts.CompilerHost;
  bazelOpts: BazelOptions;
  svelteCompilerOpts: SvelteCompilerOptions;
  compilerOpts: ts.CompilerOptions;
  files: string[];
  bazelHost?: CompilerHost;
  inputs?: Record<string, string>;
}

const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ES2015,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  alwaysStrict: false,
  inlineSourceMap: false,
  sourceMap: true,
  allowNonTsExtensions: true,
  allowJs: true,
  removeComments: true,
};

export function main(args: string[]): number {
  if (runAsWorker(args)) {
    runWorkerLoop(runOneBuild);
  } else {
    return runOneBuild(args) ? 1: 0;
  }

  return 0;
}

export function runOneBuild(args: string[], inputs?: SvelteCompileOptions['inputs']): boolean {
  if (args[0] === '-p') args.shift();
  // Strip leading at-signs, used to indicate a params file
  const project = args[0].replace(/^@+/, '');

  const [parsedOptions, errors] = parseTsconfig(project);
  if (errors && errors.length) {
    console.error(errors);
    return false;
  }

  const { options, bazelOpts, files, config } = parsedOptions;
  const svelteCompilerOpts = config['svelteCompilerOptions'] as SvelteCompilerOptions;
  const expectedOuts = svelteCompilerOpts.expectedOuts.map(p => p.replace(/\\/g, '/'));
  delete svelteCompilerOpts.expectedOuts;
  svelteCompilerOpts.dev = bazelOpts.es5Mode;
  svelteCompilerOpts.immutable = bazelOpts.es5Mode;

  const compilerOpts: ts.CompilerOptions = {
    ...options,
    ...defaultCompilerOptions,
  };

  const tsHost = ts.createCompilerHost(compilerOpts, true);

  const { diagnostics } = compileSvelte({
    compilerOpts,
    svelteCompilerOpts,
    files,
    tsHost,
    bazelOpts,
    inputs,
    expectedOuts,
  });

  return hasErrors(diagnostics);
}

function isSvelteFile(fileName: string): boolean {
  return fileName.endsWith('.svelte');
}

function hasErrors(diagnostics: ReadonlyArray<ts.Diagnostic>) {
  return diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
}

function createFileLoader(inputs?: SvelteCompileOptions['inputs']): FileLoader {
  if (!inputs) {
    return new UncachedFileLoader();
  }

  const fileLoader = new CachedFileLoader(fileCache);
  // Resolve the inputs to absolute paths to match TypeScript internals
  const resolvedInputs = new Map<string, string>();
  const inputKeys = Object.keys(inputs);

  inputKeys.forEach(key => {
    resolvedInputs.set(resolveNormalizedPath(key), inputs[key]);
  });

  fileCache.updateCache(resolvedInputs);

  return fileLoader;
}

function createSvelteSourceFile(fileName: string, target: ts.ScriptTarget): ts.SourceFile {
  const content = fs.readFileSync(fileName, 'utf8');

  let source = '';
  content.replace(SCRIPT_TAG, (_, __, code) => source = code);

  return ts.createSourceFile(
    fileName,
    source,
    target,
  );
}

function compileSvelte({ tsHost, files, expectedOuts, svelteCompilerOpts, compilerOpts, bazelHost, inputs, bazelOpts }: SvelteCompileOptions) {
  if (!compilerOpts.rootDirs) {
    throw new Error('rootDirs is not set!');
  }

  const bazelBin = compilerOpts.rootDirs.find(rootDir => BAZEL_BIN.test(rootDir));
  if (!bazelBin) {
    throw new Error(`Couldn't find bazel bin in the rootDirs: ${compilerOpts.rootDirs}`);
  }

  if (!bazelOpts.es5Mode) {
    compilerOpts.annotateForClosureCompiler = true;
    compilerOpts.annotationsAs = 'static fields';
  }

  if (typeof bazelOpts.maxCacheSizeMb === 'number') {
    const maxCacheSizeBytes = bazelOpts.maxCacheSizeMb * (1 << 20);
    fileCache.setMaxCacheSize(maxCacheSizeBytes);
  } else {
    fileCache.resetMaxCacheSize();
  }

  const fileLoader = createFileLoader(inputs);

  if (!bazelHost) {
    bazelHost = new CompilerHost(
      files,
      compilerOpts,
      bazelOpts,
      tsHost,
      fileLoader,
    );
  }

  bazelHost.transformTypesToClosure = Boolean(compilerOpts.annotateForClosureCompiler);
  const originalHostShouldNameModule = bazelHost.shouldNameModule.bind(bazelHost);
  bazelHost.shouldNameModule = (fileName: string) => {
    const flatModuleOutPath = path.posix.join(bazelOpts.package, compilerOpts.flatModuleOutFile + '.ts');

    // The bundle index file is synthesized in bundle_index_host so it's not in the
    // compilationTargetSrc.
    // However we still want to give it an AMD module name for devmode.
    // We can't easily tell which file is the synthetic one, so we build up the path we expect
    // it to have and compare against that.
    if (fileName === path.posix.join(compilerOpts.baseUrl, flatModuleOutPath)) return true;

    // Also handle the case the target is in an external repository.
    // Pull the workspace name from the target which is formatted as `@wksp//package:target`
    // if it the target is from an external workspace. If the target is from the local
    // workspace then it will be formatted as `//package:target`.
    const targetWorkspace = bazelOpts.target.split('/')[0].replace(/^@/, '');

    if (targetWorkspace && fileName === path.posix.join(compilerOpts.baseUrl, 'external', targetWorkspace, flatModuleOutPath))
      return true;

    return originalHostShouldNameModule(fileName) || SVELTE_JS_EXT.test(fileName);
  };

  const originalWriteFile = bazelHost.writeFile.bind(bazelHost);
  bazelHost.writeFile = (fileName: string, content: string, writeByteOrderMark: boolean, onError?: (message: string) => void, sourceFiles?: ts.SourceFile[]) => {
    const relative = relativeToRootDirs(fileName.replace(/\\/g, '/'), [compilerOpts.rootDir]);

    if (SVELTE_JS_EXT.test(fileName)) {
      const relativeSourceFilePath = fileName
        .replace(bazelBin, '')
        .replace(SVELTE_JS_EXT, '.svelte');

      const sourceFile = files.find(file => file.endsWith(relativeSourceFilePath));
      const source = bazelHost.readFile(sourceFile);
      content = source.replace(SCRIPT_TAG, `<script>${content}</script>`);

      content = compile(content, {
        filename: relativeSourceFilePath,
        ...svelteCompilerOpts,
      }).js.code;
    }

    const expectedIdx = expectedOuts.findIndex(o => o === relative);
    if (expectedIdx >= 0) {
      expectedOuts.splice(expectedIdx, 1);
      originalWriteFile(fileName, content, writeByteOrderMark, onError, sourceFiles);
    }
  };

  const originalGetSourceFile = bazelHost.getSourceFile.bind(bazelHost);
  bazelHost.getSourceFile = (fileName: string, target: ts.ScriptTarget) => {
    return isSvelteFile(fileName)
      ? createSvelteSourceFile(fileName, target)
      : originalGetSourceFile(fileName, target);
  };

  const program = ts.createProgram({
    rootNames: files,
    options: compilerOpts,
    host: bazelHost,
  });

  const emitResult = tsickle.emit(
    program,
    bazelHost,
    tsHost.writeFile,
  );

  let externs = '/** @externs */\n';
  if (!emitResult.diagnostics.length) {
    if (bazelOpts.tsickleGenerateExterns) {
      externs += tsickle.getGeneratedExterns(emitResult.externs);
    }
    if (bazelOpts.manifest) {
      const manifest = constructManifest(emitResult.modulesManifest, bazelHost);
      fs.writeFileSync(bazelOpts.manifest, manifest,'utf8');
    }
  }

  if (bazelOpts.tsickleExternsPath) {
    // Note: when tsickleExternsPath is provided, we always write a file as a
    // marker that compilation succeeded, even if it's empty (just containing an
    // @externs).
    fs.writeFileSync(bazelOpts.tsickleExternsPath, externs, 'utf8');
  }

  return emitResult;
}

function relativeToRootDirs(filePath: string, rootDirs: string[]): string {
  if (!filePath) return filePath;
  // NB: the rootDirs should have been sorted longest-first
  for (let i = 0; i < rootDirs.length; i++) {
    const dir = rootDirs[i];
    const rel = path.posix.relative(dir, filePath);
    if (rel.indexOf('.') != 0) return rel;
  }
  return filePath;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
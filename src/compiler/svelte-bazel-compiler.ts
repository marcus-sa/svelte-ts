// Inspired by https://github.com/angular/angular/blob/0119f46daf8f1efda00f723c5e329b0c8566fe07/packages/bazel/src/ngc-wrapped/index.ts

//import { checkModuleDeps, Plugin as StrictDepsPlugin } from '@bazel/typescript/internal/tsc_wrapped/strict_deps';
import { formatDiagnostics } from '@angular/compiler-cli';
import * as ts from 'typescript';
import { compile } from 'svelte/compiler';
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
  constructManifest,
  FileLoader,
  resolveNormalizedPath,
} from '@bazel/typescript';

import { SvelteCompilerOptions } from './svelte-compiler-options.interface';
import {
  createFileLoader,
  hasErrors,
  isSvelteInputFile,
  isSvelteOutputFile,
  relativeToRootDirs,
  SCRIPT_TAG,
  SVELTE_JS_EXT,
  BAZEL_BIN,
  MISSING_DECLARATION,
} from './utils';
import { Warning } from 'svelte/types/compiler/interfaces';

export const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ES2015,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  alwaysStrict: false,
  inlineSourceMap: false,
  sourceMap: true,
  allowNonTsExtensions: true,
  removeComments: true,
};

export function main(args: string[]): number {
  if (runAsWorker(args)) {
    runWorkerLoop((args, inputs) => {
      const svelteBazelCompiler = new SvelteBazelCompiler(args, inputs);
      return svelteBazelCompiler.compile();
    });
  } else {
    const svelteBazelCompiler = new SvelteBazelCompiler(args);
    return svelteBazelCompiler.compile() ? 1 : 0;
  }

  return 0;
}

export class SvelteBazelCompiler {
  /** The one FileCache instance used in this process. */
  private readonly fileCache = new FileCache<ts.SourceFile>(debug);
  private readonly compilerOpts: ts.CompilerOptions;
  private readonly bazelOpts: BazelOptions;
  private readonly options: SvelteCompilerOptions;
  private readonly tsHost: ts.CompilerHost;
  private readonly fileLoader: FileLoader;
  private readonly bazelHost: CompilerHost;
  private readonly files: string[];
  private readonly bazelBin: string;

  originalWriteFile: CompilerHost['writeFile'];

  constructor(args: string[], inputs?: Record<string, string>) {
    if (args[0] === '-p') args.shift();
    // Strip leading at-signs, used to indicate a params file
    const project = args[0].replace(/^@+/, '');

    const [parsedOptions, errors] = parseTsconfig(project);
    if (errors && errors.length) {
      throw console.error(formatDiagnostics(errors));
    }

    const { options: tsCompilerOpts, bazelOpts, files, config } = parsedOptions;
    this.files = files;
    this.bazelOpts = bazelOpts;
    this.compilerOpts = {
      ...tsCompilerOpts,
      ...defaultCompilerOptions,
    };

    if (!this.bazelOpts.es5Mode) {
      this.compilerOpts.annotateForClosureCompiler = true;
      this.compilerOpts.annotationsAs = 'static fields';
    }

    if (!tsCompilerOpts.rootDirs) {
      throw new Error('rootDirs is not set!');
    }

    this.bazelBin = tsCompilerOpts.rootDirs.find(rootDir =>
      BAZEL_BIN.test(rootDir),
    );
    if (!this.bazelBin) {
      throw new Error(
        `Couldn't find bazel bin in the rootDirs: ${tsCompilerOpts.rootDirs}`,
      );
    }

    const options = config['svelteCompilerOptions'] as SvelteCompilerOptions;

    options.expectedOuts = options.expectedOuts.map(p => p.replace(/\\/g, '/'));
    // TODO
    options.suppressWarnings = options.suppressWarnings || [];
    options.dev = bazelOpts.es5Mode;
    options.immutable = bazelOpts.es5Mode;
    this.options = options;

    this.tsHost = ts.createCompilerHost(this.compilerOpts, true);
    this.fileLoader = createFileLoader(this.fileCache, inputs);

    this.bazelHost = new CompilerHost(
      this.files,
      this.compilerOpts,
      this.bazelOpts,
      this.tsHost,
      this.fileLoader,
    );

    this.bazelHost.transformTypesToClosure = Boolean(
      this.compilerOpts.annotateForClosureCompiler,
    );
  }

  private createSvelteSourceFile(
    fileName: string,
    target: ts.ScriptTarget,
  ): ts.SourceFile {
    const content = this.bazelHost.readFile(fileName);

    let source = '';
    content.replace(SCRIPT_TAG, (_, __, code) => (source = code));

    return ts.createSourceFile(fileName, source, target);
  }

  private handleSvelteCompilationWarnings(warnings: Warning[]) {
    warnings.forEach(warning => {
      if (!this.options.suppressWarnings.includes(warning.code)) {
        if (warning.code === 'missing-declaration') {
          const [, component] = warning.message.match(MISSING_DECLARATION);

          if (!this.files.some(file => file.endsWith(component + '.svelte')))
            return;
        }

        // console.log(`You can suppress this warning by putting "${warning.code}" into your Svelte compiler options`);
        console.log(warning.toString());
      }
    });
  }

  private compileSvelteSource(fileName: string, content: string): string {
    const relativeSourceFilePath = fileName
      .replace(this.bazelBin, '')
      .replace(SVELTE_JS_EXT, '.svelte');

    const sourceFile = this.files.find(file =>
      file.endsWith(relativeSourceFilePath),
    );
    const source = this.bazelHost.readFile(sourceFile);
    const script = source.replace(SCRIPT_TAG, `<script>${content}</script>`);

    const options = { ...this.options };
    delete options.expectedOuts;
    delete options.suppressWarnings;

    const { js, warnings } = compile(script, {
      filename: relativeSourceFilePath,
      ...options,
    });

    this.handleSvelteCompilationWarnings(warnings);

    return js.code;
  }

  private gatherDiagnosticsForInputsOnly(program: ts.Program): ts.Diagnostic[] {
    const diagnostics: ts.Diagnostic[] = [];
    // These checks mirror ts.getPreEmitDiagnostics, with the important
    // exception of avoiding b/30708240, which is that if you call
    // program.getDeclarationDiagnostics() it somehow corrupts the emit.
    /*const strictDeps = new StrictDepsPlugin(program, {
      rootDir: this.compilerOpts.rootDir,
      allowedStrictDeps: this.bazelOpts.allowedStrictDeps,
      compilationTargetSrc: this.bazelOpts.compilationTargetSrc,
    });*/

    diagnostics.push(...program.getOptionsDiagnostics());
    diagnostics.push(...program.getGlobalDiagnostics());
    const programFiles = program
      .getSourceFiles()
      .filter(sf => isSvelteInputFile(sf.fileName));

    programFiles.forEach(sf => {
      //diagnostics.push(...strictDeps.getDiagnostics(sf));

      // Note: We only get the diagnostics for individual files
      // to e.g. not check libraries.
      diagnostics.push(...program.getSyntacticDiagnostics(sf));
      diagnostics.push(...program.getSemanticDiagnostics(sf));
    });

    return diagnostics;
  }

  private overrideBazelHost() {
    const originalHostShouldNameModule = this.bazelHost.shouldNameModule.bind(
      this.bazelHost,
    );
    this.bazelHost.shouldNameModule = (fileName: string) => {
      const flatModuleOutPath = path.posix.join(
        this.bazelOpts.package,
        this.compilerOpts.flatModuleOutFile + '.ts',
      );

      if (
        fileName ===
        path.posix.join(this.compilerOpts.baseUrl, flatModuleOutPath)
      )
        return true;

      const targetWorkspace = this.bazelOpts.target
        .split('/')[0]
        .replace(/^@/, '');

      if (
        targetWorkspace &&
        fileName ===
          path.posix.join(
            this.compilerOpts.baseUrl,
            'external',
            targetWorkspace,
            flatModuleOutPath,
          )
      )
        return true;

      return (
        originalHostShouldNameModule(fileName) || isSvelteOutputFile(fileName)
      );
    };

    this.originalWriteFile = this.bazelHost.writeFile.bind(this.bazelHost);
    this.bazelHost.writeFile = (
      fileName: string,
      content: string,
      writeByteOrderMark: boolean,
      onError?: (message: string) => void,
      sourceFiles?: ts.SourceFile[],
    ) => {
      if (isSvelteOutputFile(fileName)) {
        content = this.compileSvelteSource(fileName, content);
      }

      const relative = relativeToRootDirs(fileName.replace(/\\/g, '/'), [
        this.compilerOpts.rootDir,
      ]);
      const expectedIdx = this.options.expectedOuts.findIndex(
        o => o === relative,
      );
      if (expectedIdx >= 0) {
        this.options.expectedOuts.splice(expectedIdx, 1);
        this.originalWriteFile(
          fileName,
          content,
          writeByteOrderMark,
          onError,
          sourceFiles,
        );
      }
    };

    const originalGetSourceFile = this.bazelHost.getSourceFile.bind(
      this.bazelHost,
    );
    this.bazelHost.getSourceFile = (
      fileName: string,
      target: ts.ScriptTarget,
    ) => {
      return isSvelteInputFile(fileName)
        ? this.createSvelteSourceFile(fileName, target)
        : originalGetSourceFile(fileName, target);
    };
  }

  compile(): boolean {
    this.overrideBazelHost();

    if (typeof this.bazelOpts.maxCacheSizeMb === 'number') {
      const maxCacheSizeBytes = this.bazelOpts.maxCacheSizeMb * (1 << 20);
      this.fileCache.setMaxCacheSize(maxCacheSizeBytes);
    } else {
      this.fileCache.resetMaxCacheSize();
    }

    const program = ts.createProgram({
      rootNames: this.files,
      options: this.compilerOpts,
      host: this.bazelHost,
    });

    const allDiagnostics = this.gatherDiagnosticsForInputsOnly(program);

    const emitResult = tsickle.emit(
      program,
      this.bazelHost,
      this.bazelHost.writeFile,
    );

    allDiagnostics.push(...emitResult.diagnostics);

    let externs = '/** @externs */\n';
    if (!emitResult.diagnostics.length) {
      if (this.bazelOpts.tsickleGenerateExterns) {
        externs += tsickle.getGeneratedExterns(emitResult.externs);
      }
      if (this.bazelOpts.manifest) {
        const manifest = constructManifest(
          emitResult.modulesManifest,
          this.bazelHost,
        );
        fs.writeFileSync(this.bazelOpts.manifest, manifest, 'utf8');
      }
    }

    if (this.bazelOpts.tsickleExternsPath) {
      fs.writeFileSync(this.bazelOpts.tsickleExternsPath, externs, 'utf8');
    }

    this.options.expectedOuts.forEach(outputFile => {
      // @ts-ignore
      this.originalWriteFile(outputFile, '', false);
    });

    if (allDiagnostics.length) {
      console.error(formatDiagnostics(allDiagnostics));
    }

    return hasErrors(allDiagnostics);
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

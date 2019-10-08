// Inspired by https://github.com/angular/angular/blob/0119f46daf8f1efda00f723c5e329b0c8566fe07/packages/bazel/src/ngc-wrapped/index.ts

import { formatDiagnostics } from '@angular/compiler-cli';
import * as ts from 'typescript';
import { compile, parse } from 'svelte/compiler';
import * as fs from 'fs';
import * as tsickle from 'tsickle';
import * as path from 'path';
import {
  BazelOptions,
  CompilerHost,
  constructManifest,
  debug,
  FileCache,
  FileLoader,
  log,
  parseTsconfig,
} from '@bazel/typescript';

import { SvelteCompilerOptions } from './svelte-compiler-options.interface';
import {
  createSvelteComponentImport,
  functionDeclarationToMethodDeclaration,
  variableStatementToPropertyDeclaration,
  getSvelteComponentIdentifier,
  getSvelteComponentNodes,
  getAllImports,
  SvelteComponentNode,
  collectDeepNodes,
} from './ast-helpers';
import {
  SCRIPT_TAG,
  SVELTE_JS_EXT,
  MISSING_DECLARATION,
  BAZEL_BIN,
  createFileLoader,
  getSvelteNameFromPath,
  hasDiagnosticsErrors,
  isSvelteDeclarationFile,
  isSvelteInputFile,
  isSvelteOutputFile,
  relativeToRootDirs,
  SVELTE_FILE_COMPONENT_NAME,
} from './utils';
import { type } from 'os';

export type SvelteCompilation = ReturnType<typeof compile>;

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

export class SvelteBazelCompiler {
  /** The one FileCache instance used in this process. */
  private readonly svelteTemplateCache = new Map<string, SvelteCompilation>();
  private readonly fileCache = new FileCache<ts.SourceFile>(debug);
  private readonly compilerOpts: ts.CompilerOptions;
  private readonly bazelOpts: BazelOptions;
  private readonly options: SvelteCompilerOptions;
  private readonly tsHost: ts.CompilerHost;
  private readonly fileLoader: FileLoader;
  private readonly bazelHost: CompilerHost;
  private readonly files: string[];
  private readonly bazelBin: string;
  private originalWriteFile: ts.CompilerHost['writeFile'];
  private originalGetSourceFile: CompilerHost['getSourceFile'];
  private program: ts.Program;

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

  private handleSvelteCompilationWarnings({ warnings }: SvelteCompilation) {
    warnings.forEach(warning => {
      if (!this.options.suppressWarnings.includes(warning.code)) {
        if (warning.code === 'missing-declaration') {
          const [, component] = warning.message.match(MISSING_DECLARATION);

          if (!this.files.some(file => file.endsWith(component + '.svelte')))
            return;
        }

        // console.log(`You can suppress this warning by putting "${warning.code}" into your Svelte compiler options`);
        log(warning.toString());
      }
    });
  }

  private createSvelteSourceFile(
    fileName: string,
    target: ts.ScriptTarget,
  ): ts.SourceFile {
    const content = this.bazelHost.readFile(fileName);

    let source = '';
    content.replace(SCRIPT_TAG, (_, __, code) => (source = code));

    return ts.createSourceFile(fileName, source, target);
    // TODO: Validate against AST later
  }

  private createSvelteComponentDeclarationSource(
    fileName: string,
    sourceFile: ts.SourceFile,
  ): string {
    const properties: ts.PropertyDeclaration[] = [];
    const methods: ts.MethodDeclaration[] = [];
    const imports: ts.ImportDeclaration[] = [];

    const checker = this.program.getTypeChecker();

    ts.forEachChild(sourceFile, (child: ts.Node) => {
      if (ts.isVariableStatement(child)) {
        properties.push(variableStatementToPropertyDeclaration(checker, child));
      }

      if (ts.isFunctionDeclaration(child)) {
        methods.push(functionDeclarationToMethodDeclaration(child));
      }

      if (ts.isImportDeclaration(child)) {
        imports.push(child);
      }
    });

    const svelteComponentImport = createSvelteComponentImport(this.options.dev);
    const componentName = getSvelteNameFromPath(fileName);

    const type = ts.createExpressionWithTypeArguments(
      undefined,
      getSvelteComponentIdentifier(this.options.dev),
    );

    const heritageClause = ts.createHeritageClause(
      ts.SyntaxKind.ExtendsKeyword,
      [type],
    );

    const exportDefaultModifier = ts.createModifiersFromModifierFlags(
      ts.ModifierFlags.ExportDefault,
    );
    const component = ts.createClassDeclaration(
      undefined,
      exportDefaultModifier,
      ts.createIdentifier(componentName),
      undefined,
      [heritageClause],
      [...properties, ...methods],
    );

    const nodes = ts.createNodeArray([
      svelteComponentImport,
      ...imports,
      component,
    ]);

    const printer = ts.createPrinter({
      newLine: ts.NewLineKind.LineFeed,
    });

    return printer.printList(ts.ListFormat.MultiLine, nodes, sourceFile);
  }

  private compileSvelteSource(fileName: string, content: string): string {
    const relativeSourceFilePath = fileName
      .replace(this.bazelBin, '')
      .replace(SVELTE_JS_EXT, '.svelte');

    const sourceFileName = this.files.find(file =>
      file.endsWith(relativeSourceFilePath),
    );
    const source = this.bazelHost.readFile(sourceFileName);
    const script = source.replace(SCRIPT_TAG, `<script>${content}</script>`);

    const options = { ...this.options };
    delete options.expectedOuts;
    delete options.suppressWarnings;

    const compilation = compile(script, {
      filename: relativeSourceFilePath,
      ...options,
    });

    this.handleSvelteCompilationWarnings(compilation);

    this.svelteTemplateCache.set(sourceFileName, compilation);

    return compilation.js.code;
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

      if (isSvelteDeclarationFile(fileName)) {
        content = this.createSvelteComponentDeclarationSource(
          fileName,
          sourceFiles[0],
        );
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

    this.originalGetSourceFile = this.bazelHost.getSourceFile.bind(
      this.bazelHost,
    );
    this.bazelHost.getSourceFile = (
      fileName: string,
      target: ts.ScriptTarget,
    ): ts.SourceFile => {
      if (isSvelteInputFile(fileName)) {
        return this.createSvelteSourceFile(fileName, target);
      }

      return this.originalGetSourceFile(fileName, target);
    };
  }

  // TODO: Compatible error messages as TS diagnostics
  private gatherDiagnosticsForSvelteTemplate(
    sourceFile: ts.SourceFile,
  ): ts.Diagnostic[] {
    const compilation = this.svelteTemplateCache.get(sourceFile.fileName);
    const diagnostics: ts.Diagnostic[] = [];

    if (compilation) {
      const componentNodes = getSvelteComponentNodes(compilation.ast.html);

      const hasComponentNode = (
        node: ts.ImportClause | ts.ImportSpecifier,
      ): boolean =>
        componentNodes.some(({ name }) => name === node.name.escapedText);

      const getComponentNode = () => (
        node: ts.ImportClause | ts.ImportSpecifier,
      ): SvelteComponentNode =>
        componentNodes.find(({ name }) => name === node.name.escapedText);

      const something = [];

      const typeChecker = this.program.getTypeChecker();

      if (componentNodes.length) {
        const allImports = getAllImports(sourceFile);
        const componentImports = new Set<
          [ts.ImportClause | ts.ImportSpecifier, ts.StringLiteral]
        >();

        // : ts.NodeArray<ImportSpecifier> | ts.ImportClause[]
        // TODO: Some weird error where Array.prototype.flatMap doesn't exist

        for (const { importClause, moduleSpecifier } of allImports) {
          if (ts.isNamedImports(importClause.namedBindings)) {
            for (const specifier of importClause.namedBindings.elements) {
              // there can be either propertyName or name which reflects the real name of the import
              // if it is a named import, it'll have a "propertyName", otherwise the real import will be "name"
              if (hasComponentNode(specifier)) {
                componentImports.add([
                  specifier,
                  moduleSpecifier as ts.StringLiteral,
                ]);
              }
            }
          } else if (hasComponentNode(importClause)) {
            componentImports.add([
              importClause,
              moduleSpecifier as ts.StringLiteral,
            ]);
          }
        }

        for (const [
          identifier,
          { text: moduleName },
        ] of componentImports.values()) {
          // TODO: Type check if import is a class which extends SvelteComponent/SvelteComponentDev
          // TODO: Type check methods
          // TODO: Type check props
          log(typeChecker.getTypeAtLocation(identifier));

          const moduleId = this.bazelHost.fileNameToModuleId(
            sourceFile.fileName,
          );
          const containingFile = path.join(this.bazelBin, moduleId);
          const { resolvedModule } = ts.resolveModuleName(
            moduleName,
            containingFile,
            this.compilerOpts,
            this.bazelHost,
          );

          /*if (resolvedModule) {
            const sourceFile = this.bazelHost.getSourceFile(
              resolvedModule.resolvedFileName,
              this.compilerOpts.target,
            );
          }*/
        }
      }
    }

    return diagnostics;
  }

  private gatherDiagnosticsForInputsOnly(): ts.Diagnostic[] {
    const diagnostics: ts.Diagnostic[] = [];
    // These checks mirror ts.getPreEmitDiagnostics, with the important
    // exception of avoiding b/30708240, which is that if you call
    // program.getDeclarationDiagnostics() it somehow corrupts the emit.
    /*const strictDeps = new StrictDepsPlugin(program, {
      rootDir: this.compilerOpts.rootDir,
      allowedStrictDeps: this.bazelOpts.allowedStrictDeps,
      compilationTargetSrc: this.bazelOpts.compilationTargetSrc,
    });*/

    diagnostics.push(...this.program.getOptionsDiagnostics());
    diagnostics.push(...this.program.getGlobalDiagnostics());
    const programFiles = this.program
      .getSourceFiles()
      .filter(sf => isSvelteInputFile(sf.fileName));

    return programFiles.reduce(
      (allDiagnostics, sf) => [
        //diagnostics.push(...strictDeps.getDiagnostics(sf));
        // Note: We only get the diagnostics for individual files
        // to e.g. not check libraries.
        ...allDiagnostics,
        ...this.gatherDiagnosticsForSvelteTemplate(sf),
        ...this.program.getSyntacticDiagnostics(sf),
        ...this.program.getSemanticDiagnostics(sf),
      ],
      diagnostics,
    );
  }

  compile(): boolean {
    this.overrideBazelHost();

    if (typeof this.bazelOpts.maxCacheSizeMb === 'number') {
      const maxCacheSizeBytes = this.bazelOpts.maxCacheSizeMb * (1 << 20);
      this.fileCache.setMaxCacheSize(maxCacheSizeBytes);
    } else {
      this.fileCache.resetMaxCacheSize();
    }

    this.program = ts.createProgram({
      rootNames: this.files,
      options: this.compilerOpts,
      host: this.bazelHost,
    });

    const emitResult = tsickle.emit(
      this.program,
      this.bazelHost,
      this.bazelHost.writeFile,
    );

    const allDiagnostics = this.gatherDiagnosticsForInputsOnly();
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
      this.originalWriteFile(outputFile, '', false);
    });

    if (allDiagnostics.length) {
      console.error(formatDiagnostics(allDiagnostics));
    }

    return !hasDiagnosticsErrors(allDiagnostics);
  }
}

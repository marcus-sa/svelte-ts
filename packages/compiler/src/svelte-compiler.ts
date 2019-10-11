import * as ts from 'typescript';
import * as svelte from '@svelte-ts/common';
import {
  createSvelteComponentImport,
  functionDeclarationToMethodDeclaration,
  getSvelteComponentIdentifier,
  variableStatementToPropertyDeclaration,
} from './ts-ast-helpers';

export class SvelteCompiler {
  protected svelteCompilationCache: svelte.CompilationCache;
  protected rootDir: string;
  protected compilerOpts: ts.CompilerOptions;
  protected options: svelte.CompilerOptions;
  protected files: string[];
  protected tsHost: ts.CompilerHost;
  protected program: ts.Program;

  protected createSvelteSourceFile(
    fileName: string,
    target: ts.ScriptTarget,
  ): ts.SourceFile {
    const content = this.tsHost.readFile(fileName);

    let source = '';
    content.replace(svelte.SCRIPT_TAG, (_, __, code) => (source = code));

    return ts.createSourceFile(fileName, source, target);
  }

  protected compileSvelteSource(fileName: string, content: string): string {
    const sourceFileName = svelte.getInputFileFromOutputFile(
      fileName,
      this.rootDir,
      this.files,
    );
    const source = this.tsHost.readFile(sourceFileName);
    const script = source.replace(
      svelte.SCRIPT_TAG,
      `<script>${content}</script>`,
    );

    const options = { ...this.options };
    delete options.expectedOuts;
    delete options.suppressWarnings;

    const compilation = svelte.compile(script, {
      filename: sourceFileName,
      ...options,
    });

    this.svelteCompilationCache.set(sourceFileName, [content, compilation]);

    return compilation.js.code;
  }

  protected createSvelteComponentDeclarationSource(
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
    const componentName = svelte.getNameFromPath(fileName);

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
}

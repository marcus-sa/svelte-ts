import * as ts from 'typescript';
import * as bazel from '@bazel/typescript';
import { log } from '@bazel/typescript';
import {
  SCRIPT_TAG,
  collectDeepNodes,
  getInputFileFromOutputFile,
  getAllImports,
  findClassDeclaration,
  SvelteCompilationCache,
  SvelteDiagnostic,
  getTextFromNamedDeclaration,
} from '@svelte-ts/common';

import {
  addParentNodeReferences,
  getInlineComponents,
  isMustacheTag,
} from './ast-helpers';
import { IfBlock, InlineComponent } from './nodes';
import { Node } from './interfaces';

export class SvelteTypeChecker {
  constructor(
    private readonly bazelHost: bazel.CompilerHost,
    private readonly typeChecker: ts.TypeChecker,
    private readonly bazelBin: string,
    private readonly compilerOpts: ts.CompilerOptions,
    private readonly compilationCache: SvelteCompilationCache,
  ) {}

  // TODO: Use https://github.com/aceakash/string-similarity to help pinpoint typos
  private gatherInlineComponentAttributeDiagnostics(
    scriptFile: ts.SourceFile,
    sourceFile: ts.SourceFile,
    component: ts.ClassDeclaration,
    { attributes }: InlineComponent,
  ): SvelteDiagnostic[] {
    const identifiers = collectDeepNodes<ts.Identifier>(
      scriptFile,
      ts.SyntaxKind.Identifier,
    );

    const identifiersHasNode = (node: Node): boolean =>
      identifiers.some(({ escapedText }) => escapedText === node.name);

    const memberNames = component.members.map(member => {
      return (member.name as ts.Identifier).escapedText.toString();
    });

    return attributes.reduce(
      (diagnostics, attr) => {
        // Attribute identifier does not exist
        // This is the value we have to check if exist on the component
        if (!memberNames.includes(attr.name)) {
          diagnostics.push({
            category: ts.DiagnosticCategory.Error,
            start: attr.start,
            length: attr.name.length,
            messageText: `Attribute '${attr.name}' doesn't exist on '${component.name.escapedText}'.`,
            file: sourceFile,
            code: attr.type,
          });
        }

        // @ts-ignore
        attr.value.forEach(({ expression }) => {
          // Validates that identifier exists
          // and if it does, then validate against the given type
          if (!identifiersHasNode(expression)) {
            diagnostics.push({
              category: ts.DiagnosticCategory.Error,
              start: expression.start,
              length: expression.end - expression.start,
              messageText: `Identifier '${expression.name}' cannot be found`,
              file: sourceFile,
              code: expression.type,
            });
          } else {
          }
        });

        return diagnostics;
      },
      [] as SvelteDiagnostic[],
    );
  }

  private gatherInlineComponentDiagnostics(
    sourceFile: ts.SourceFile,
    compiledSvelteFile: ts.SourceFile,
    fragment: Node,
  ): SvelteDiagnostic[] {
    const componentNodes = getInlineComponents(fragment);
    const diagnostics: SvelteDiagnostic[] = [];

    const getComponentNode = (
      node: ts.ImportClause | ts.ImportSpecifier,
    ): InlineComponent =>
      componentNodes.find(
        ({ name }) => name === getTextFromNamedDeclaration(node),
      );

    const removeComponentNode = (
      componentNode: InlineComponent,
    ): InlineComponent[] =>
      componentNodes.splice(componentNodes.indexOf(componentNode), 1);

    if (componentNodes.length) {
      const allImports = getAllImports(sourceFile);
      const componentImports = new Map<
        InlineComponent,
        ts.ImportClause | ts.ImportSpecifier
      >();

      const addComponentImport = (
        node: ts.ImportClause | ts.ImportSpecifier,
      ) => {
        const componentNode = getComponentNode(node);
        // there can be either propertyName or name which reflects the real name of the import
        // if it is a named import, it'll have a "propertyName", otherwise the real import will be "name"
        if (componentNode) {
          componentImports.set(componentNode, node);
          removeComponentNode(componentNode);
        }
      };

      // TODO: Check that components have been imported
      for (const { importClause } of allImports) {
        if (ts.isNamedImports(importClause.namedBindings)) {
          for (const specifier of importClause.namedBindings.elements) {
            // there can be either propertyName or name which reflects the real name of the import
            // if it is a named import, it'll have a "propertyName", otherwise the real import will be "name"
            addComponentImport(specifier);
          }
        } else {
          addComponentImport(importClause);
        }
      }

      componentNodes.forEach(component => {
        diagnostics.push({
          file: compiledSvelteFile,
          category: ts.DiagnosticCategory.Error,
          start: component.start,
          length: component.end - component.start,
          // Identifier
          messageText: `Import declaration for '${component.name}' cannot be found.`,
          code: component.type,
        });
      });

      for (const [componentNode, identifier] of componentImports.entries()) {
        const type = this.typeChecker.getTypeAtLocation(identifier);
        const componentDecl = findClassDeclaration(type.symbol.declarations);
        // TODO: Type check if import is a class which extends SvelteComponent/SvelteComponentDev
        // TODO: Type check methods
        // TODO: Type check props

        if (componentDecl) {
          // @ts-ignore
          diagnostics.push(
            ...this.gatherInlineComponentAttributeDiagnostics(
              sourceFile,
              compiledSvelteFile,
              componentDecl,
              componentNode,
            ),
          );
        }
        // @ts-ignore
        //log(type.symbol.heritageClauses);
        /*if (!ts.isClassDeclaration) {
          throw new Error('is not a class declaration');
        } else {

          if (symbol) {
            log((identifier as ts.ClassLikeDeclarationBase).heritageClauses);

           // log(symbol.valueDeclaration.members);
          } else {

          }
        }*/

        //log(getComponentNode(identifier));

        /*const moduleId = this.bazelHost.fileNameToModuleId(
          sourceFile.fileName,
        );
        const containingFile = path.join(this.bazelBin, moduleId);
        const { resolvedModule } = ts.resolveModuleName(
          moduleName,
          containingFile,
          this.compilerOpts,
          this.bazelHost,
        );*/

        /*if (resolvedModule) {
          const sourceFile = this.bazelHost.getSourceFile(
            resolvedModule.resolvedFileName,
            this.compilerOpts.target,
          );
        }*/
      }
    }

    return diagnostics;
  }

  private gatherIfBlockDiagnostics(node: IfBlock) {}

  private getCompiledSvelteFile(
    sourceFile: ts.SourceFile,
    compiledSource: string,
  ): ts.SourceFile {
    const fileName = getInputFileFromOutputFile(
      sourceFile.fileName,
      this.bazelBin,
      this.bazelHost.inputFiles,
    );

    const source = this.bazelHost
      .readFile(fileName)
      .replace(SCRIPT_TAG, `<script>${compiledSource}</script>`);

    return ts.createSourceFile(fileName, source, this.compilerOpts.target);
  }

  gatherAllDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    const [compiledSource, compilation] = this.compilationCache.get(
      sourceFile.fileName,
    );

    const compiledSvelteFile = this.getCompiledSvelteFile(
      sourceFile,
      compiledSource,
    );

    const diagnostics: SvelteDiagnostic[] = [];

    if (compilation) {
      // HINT: There'll always be a top level fragment node
      const fragment = addParentNodeReferences(compilation.ast.html);

      diagnostics.push(
        ...this.gatherInlineComponentDiagnostics(
          sourceFile,
          compiledSvelteFile,
          fragment,
        ),
      );

      fragment.children.forEach(child => {
        log(child);
        if (isMustacheTag(child)) {
        }
      });
    }

    return <ts.Diagnostic[]>(<unknown>diagnostics);
  }
}

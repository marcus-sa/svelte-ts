import * as ts from 'typescript';
import Attribute from 'svelte/types/compiler/compile/nodes/Attribute';
import InlineComponent from 'svelte/types/compiler/compile/nodes/InlineComponent';
import * as bazel from '@bazel/typescript';
import { log } from '@bazel/typescript';

import { SvelteCompilationCache } from './svelte-compiler-options.interface';
import {
  collectDeepNodes,
  getAllImports,
  getSvelteComponentNodes,
} from './ast-helpers';
import * as path from 'path';
import { getInputFileFromOutputFile, SCRIPT_TAG } from './utils';

function findClassDeclaration(
  declarations: ts.Declaration[],
): ts.ClassDeclaration | null {
  return declarations.find(decl =>
    ts.isClassDeclaration(decl),
  ) as ts.ClassDeclaration;
}

export class SvelteTypeChecker {
  constructor(
    private readonly bazelHost: bazel.CompilerHost,
    private readonly typeChecker: ts.TypeChecker,
    private readonly bazelBin: string,
    private readonly compilerOpts: ts.CompilerOptions,
    private readonly compilationCache: SvelteCompilationCache,
  ) {}

  // TODO: Use https://github.com/aceakash/string-similarity to help pinpoint typos
  private gatherAttrDiagnostics(
    sourceFile: ts.SourceFile,
    scriptSource: string,
    component: ts.ClassDeclaration,
    { attributes }: InlineComponent,
  ): ts.Diagnostic[] {
    const fileName = getInputFileFromOutputFile(
      sourceFile.fileName,
      this.bazelBin,
      this.bazelHost.inputFiles,
    );

    const source = this.bazelHost
      .readFile(fileName)
      .replace(SCRIPT_TAG, `<script>${scriptSource}</script>`);

    const identifiers = collectDeepNodes<ts.Identifier>(
      sourceFile,
      ts.SyntaxKind.Identifier,
    );

    const file = ts.createSourceFile(
      fileName,
      source,
      this.compilerOpts.target,
    );

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
            messageText: `Attribute "${attr.name}" doesn't exist on ${component.name.escapedText}`,
            code: 0,
            file,
          });
        }

        // @ts-ignore
        attr.value.forEach(({ expression }) => {
          // Validates that identifier exists
          // and if it does, then validate against the given type
          if (
            !identifiers.some(
              ({ escapedText }) => escapedText === expression.name,
            )
          ) {
            diagnostics.push({
              category: ts.DiagnosticCategory.Error,
              start: expression.start,
              length: expression.end - expression.start,
              messageText: `Identifier "${expression.name}" cannot be found`,
              code: 0,
              file,
            });
          } else {
          }
        });

        return diagnostics;
      },
      [] as ts.Diagnostic[],
    );
  }

  gatherAllDiagnostics(sourceFile: ts.SourceFile): ts.Diagnostic[] {
    const [compiledSource, compilation] = this.compilationCache.get(
      sourceFile.fileName,
    );
    const diagnostics: ts.Diagnostic[] = [];

    if (compilation) {
      const componentNodes = getSvelteComponentNodes(compilation.ast.html);

      const hasComponentNode = (
        node: ts.ImportClause | ts.ImportSpecifier,
      ): boolean =>
        componentNodes.some(({ name }) => name === node.name.escapedText);

      const getComponentNode = (
        node: ts.ImportClause | ts.ImportSpecifier,
      ): InlineComponent =>
        componentNodes.find(({ name }) => name === node.name.escapedText);

      if (componentNodes.length) {
        const allImports = getAllImports(sourceFile);
        const componentImports = new Set<
          [ts.ImportClause | ts.ImportSpecifier, ts.StringLiteral]
        >();

        // TODO: Check that components have been imported
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
          const type = this.typeChecker.getTypeAtLocation(identifier);
          const componentDecl = findClassDeclaration(type.symbol.declarations);
          const componentNode = getComponentNode(identifier);
          // TODO: Type check if import is a class which extends SvelteComponent/SvelteComponentDev
          // TODO: Type check methods
          // TODO: Type check props

          if (componentDecl) {
            // @ts-ignore
            diagnostics.push(
              ...this.gatherAttrDiagnostics(
                sourceFile,
                compiledSource,
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
}

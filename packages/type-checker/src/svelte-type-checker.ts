import * as ts from 'typescript';
import { CompilerHost, log } from '@bazel/typescript';
import * as tsSimple from 'ts-simple-type';
import { findBestMatch } from 'string-similarity';
import {
  SCRIPT_TAG,
  collectDeepNodes,
  getInputFileFromOutputFile,
  getAllImports,
  findClassDeclaration,
  getIdentifierName,
  SvelteCompilationCache,
  SvelteDiagnostic,
  formatDiagnosticMessageTexts,
} from '@svelte-ts/common';

import { IfBlock, InlineComponent } from './nodes';
import { Identifier, Node } from './interfaces';
import {
  addParentNodeReferences,
  getInlineComponents,
  isAttribute,
  isAttributeShortHand,
  isIdentifier,
  isInlineComponent,
  isMustacheTag,
  isSpread,
} from './ast-helpers';
import {
  createAttributeNonExistentDiagnostic,
  createComponentTypesNotAssignableDiagnostic,
  createIdentifierNotFoundDiagnostic,
} from '@svelte-ts/type-checker/src/diagnostics';

export class SvelteTypeChecker {
  constructor(
    private readonly bazelHost: CompilerHost,
    private readonly typeChecker: ts.TypeChecker,
    private readonly bazelBin: string,
    private readonly compilerOpts: ts.CompilerOptions,
    private readonly compilationCache: SvelteCompilationCache,
  ) {}

  private isAssignableToType(
    typeA: ts.Type | ts.Node,
    typeB: ts.Type | ts.Node,
  ): boolean {
    return tsSimple.isAssignableToType(typeA, typeB, this.typeChecker, {
      strict: true,
      strictFunctionTypes: true,
      strictNullChecks: true,
    });
  }

  private gatherAttributeDiagnostics(
    memberNames: string[],
    identifierNames: string[],
    identifiers: ts.Identifier[],
    component: ts.ClassDeclaration,
    sourceFile: ts.SourceFile,
    node: Node,
  ): SvelteDiagnostic[] {
    const getIdentifierByNode = (node: Identifier): ts.Identifier | null =>
      identifiers.find(
        identifier => getIdentifierName(identifier) === node.name,
      );

    const diagnostics: SvelteDiagnostic[] = [];

    // log(node);

    // Attribute identifier does not exist
    // This is the value we have to check if exist on the component
    if (isIdentifier(node)) {
      // FIX: Needs to find an actual declaration
      const identifier = getIdentifierByNode(node);

      // Identifier does not exist in context
      if (!identifier) {
        diagnostics.push(
          createIdentifierNotFoundDiagnostic(identifierNames, node, sourceFile),
        );
      } else {
        // Check if identifier is an object
        // and if identifier contains strict member names
        const type = this.typeChecker.getTypeAtLocation(identifier);
        const compType = this.typeChecker.getTypeAtLocation(component);

        if (isSpread(node.parent)) {
          /**
           * When attributes are spread, instead show that type is not assignable to component
           */
          if (!this.isAssignableToType(type, compType)) {
            // TODO
            // log(this.typeChecker.typeToString(type));
            // log(this.typeChecker.typeToString(compType));
            /*const properties = type.getProperties().map(property => property.getName());
            type.getProperties().forEach(property => {
              property.valueDeclaration
            });*/
            /*properties.forEach(property => {
              diagnostics.push(
                createAttributeNonExistentDiagnostic(
                  memberNames,
                  property.,
                  component,
                  sourceFile,
                ),
              );
            });*/
            //log(type.symbol.declarations.reduce((names, { properties }) => [...names, ...properties.map(property => getIdentifierName(property))], []));
          }
        } else {
          const property = compType
            .getProperties()
            .find(prop => prop.escapedName === node.name);
          const propertyType = this.typeChecker.getTypeAtLocation(
            property.valueDeclaration,
          );

          log(this.typeChecker.typeToString(type));
          log(this.typeChecker.typeToString(propertyType));

          if (!this.isAssignableToType(identifier, propertyType)) {
            diagnostics.push(
              createComponentTypesNotAssignableDiagnostic(
                node,
                type,
                node as any,
                component,
                propertyType,
                sourceFile,
                this.typeChecker,
              ),
            );
          }
        }
      }
    }

    if (isAttribute(node)) {
      // check that attribute exists
      if (!memberNames.includes(node.name)) {
        diagnostics.push(
          createAttributeNonExistentDiagnostic(
            memberNames,
            node,
            component,
            sourceFile,
          ),
        );
      } else {
        node.value.forEach(value => {
          diagnostics.push(
            ...this.gatherAttributeDiagnostics(
              memberNames,
              identifierNames,
              identifiers,
              component,
              sourceFile,
              value,
            ),
          );
        });
      }
      // if attribute name is the same as identifier, suggest using a short hand attribute instead
      // name={name} can be replaced with the {name} shorthand
      // we need a way to link to stuff in documentation

      // log(value);

      // Validates that identifier exists
      // and if it does, then validate against the given type
      /*if (value.expression && !identifiersHasNode(value.expression)) {
        diagnostics.push(
          createIdentifierNotFoundDiagnostic(
            identifierNames,
            value.expression,
            sourceFile,
          ),
        );
      } else {
      }*/
    }

    // if it's a short hand, check that both the identifier exists, and that the attribute does
    /*if (isAttributeShortHand(node)) {
      const identifier = getIdentifierByNode(node.expression);

      // Identifier does not exist in context
      if (!identifier) {
        diagnostics.push(
          createIdentifierNotFoundDiagnostic(
            identifierNames,
            node.expression,
            sourceFile,
          ),
        );
      }

      if (!memberNames.includes(node.expression.name)) {
        diagnostics.push(
          createAttributeNonExistentDiagnostic(
            memberNames,
            node.expression,
            component,
            sourceFile,
          ),
        );
      }
    }*/

    if (isMustacheTag(node) || isSpread(node) || isAttributeShortHand(node)) {
      node.expression.parent = node;

      diagnostics.push(
        ...this.gatherAttributeDiagnostics(
          memberNames,
          identifierNames,
          identifiers,
          component,
          sourceFile,
          node.expression,
        ),
      );
    }

    return diagnostics;
  }

  // Gathers diagnostics for attributes on Svelte components
  private gatherInlineComponentAttributeDiagnostics(
    scriptFile: ts.SourceFile,
    sourceFile: ts.SourceFile,
    component: ts.ClassDeclaration,
    inlineComponent: any,
  ): SvelteDiagnostic[] {
    // FIX: Needs to be declarations
    const identifiers = collectDeepNodes<ts.Identifier>(
      scriptFile,
      ts.SyntaxKind.VariableDeclaration,
    );

    const memberNames = component.members.map(member =>
      getIdentifierName(member),
    );
    const identifierNames = identifiers.map(identifier =>
      getIdentifierName(identifier),
    );

    // this should be recursive
    return inlineComponent.attributes.reduce(
      (diagnostics, node) => {
        node.parent = inlineComponent;

        return [
          ...diagnostics,
          ...this.gatherAttributeDiagnostics(
            memberNames,
            identifierNames,
            identifiers,
            component,
            sourceFile,
            node,
          ),
        ];
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
      componentNodes.find(({ name }) => name === getIdentifierName(node));

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
        const messageText = formatDiagnosticMessageTexts([
          // Identifier
          `Import declaration for '${component.name}' cannot be found.`,
        ]);

        diagnostics.push({
          file: compiledSvelteFile,
          category: ts.DiagnosticCategory.Error,
          start: component.start,
          length: component.end - component.start,
          code: component.type,
          messageText,
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

  private gatherNodeDiagnostics(
    sourceFile: ts.SourceFile,
    compiledSvelteFile: ts.SourceFile,
    node: Node,
  ): SvelteDiagnostic[] {
    const diagnostics: SvelteDiagnostic[] = [];

    if (isInlineComponent(node)) {
      diagnostics.push(
        ...this.gatherInlineComponentDiagnostics(
          sourceFile,
          compiledSvelteFile,
          node,
        ),
      );
    }

    if (node.children) {
      node.children.forEach(child => {
        // HINT: Children will have node as parent, so referencing it for checking object property access will be fine
        child.parent = node;

        diagnostics.push(
          ...this.gatherNodeDiagnostics(sourceFile, compiledSvelteFile, child),
        );
      });
    }

    return diagnostics;
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
      //const fragment = addParentNodeReferences(compilation.ast.html);

      diagnostics.push(
        ...this.gatherNodeDiagnostics(
          sourceFile,
          compiledSvelteFile,
          compilation.ast.html,
        ),
      );
    }

    return <ts.Diagnostic[]>(<unknown>diagnostics);
  }
}

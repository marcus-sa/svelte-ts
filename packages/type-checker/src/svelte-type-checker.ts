import { CompilerHost, log } from '@bazel/typescript';
import * as tsSimple from 'ts-simple-type';
import * as ts from 'typescript';
import * as svelte from '@svelte-ts/common';

import {
  createNonExistentPropertyDiagnostic,
  createComponentTypesNotAssignableDiagnostic,
  createIdentifierNotFoundDiagnostic,
} from './diagnostics';

export class SvelteTypeChecker {
  constructor(
    private readonly bazelHost: CompilerHost,
    private readonly typeChecker: ts.TypeChecker,
    private readonly bazelBin: string,
    private readonly compilerOpts: ts.CompilerOptions,
    private readonly compilationCache: svelte.CompilationCache,
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

  private gatherPropertyDiagnostics(
    memberNames: string[],
    declarationNames: string[],
    declarations: ts.NamedDeclaration[],
    component: ts.ClassDeclaration,
    compiledSourceFile: ts.SourceFile,
    node: svelte.Node,
  ): svelte.Diagnostic[] {
    const getDeclarationByNode = (
      node: svelte.Identifier,
    ): ts.NamedDeclaration | null =>
      declarations.find(
        identifier => svelte.getDeclarationName(identifier) === node.name,
      );

    const diagnostics: svelte.Diagnostic[] = [];

    // Attribute identifier does not exist
    // This is the value we have to check if exist on the component
    if (svelte.isIdentifier(node)) {
      // FIX: Needs to find an actual declaration
      const identifier = getDeclarationByNode(node);

      // Identifier does not exist in context
      if (!identifier) {
        diagnostics.push(
          createIdentifierNotFoundDiagnostic(
            declarationNames,
            node,
            compiledSourceFile,
          ),
        );
      } else {
        // Check if identifier is an object
        // and if identifier contains strict member names
        const type = this.typeChecker.getTypeAtLocation(identifier);
        const compType = this.typeChecker.getTypeAtLocation(component);

        if (svelte.isSpread(node.parent)) {
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
                createNonExistentPropertyDiagnostic(
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
                compiledSourceFile,
                this.typeChecker,
              ),
            );
          }
        }
      }
    }

    if (svelte.isAttribute(node)) {
      // check that attribute exists
      if (!memberNames.includes(node.name)) {
        diagnostics.push(
          createNonExistentPropertyDiagnostic(
            memberNames,
            node,
            component,
            compiledSourceFile,
          ),
        );
      } else {
        node.value.forEach(value => {
          diagnostics.push(
            ...this.gatherPropertyDiagnostics(
              memberNames,
              declarationNames,
              declarations,
              component,
              compiledSourceFile,
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
          createNonExistentPropertyDiagnostic(
            memberNames,
            node.expression,
            component,
            sourceFile,
          ),
        );
      }
    }*/

    if (
      svelte.isMustacheTag(node) ||
      svelte.isSpread(node) ||
      svelte.isAttributeShortHand(node)
    ) {
      node.expression.parent = node;

      diagnostics.push(
        ...this.gatherPropertyDiagnostics(
          memberNames,
          declarationNames,
          declarations,
          component,
          compiledSourceFile,
          node.expression,
        ),
      );
    }

    return diagnostics;
  }

  // Gathers diagnostics for attributes on Svelte components
  private gatherComponentPropertyDiagnostics(
    scriptSourceFile: ts.SourceFile,
    compiledSourceFile: ts.SourceFile,
    componentDeclaration: ts.ClassDeclaration,
    component: svelte.Component,
  ): svelte.Diagnostic[] {
    // FIX: Needs to be declarations
    const declarations = svelte.collectDeepNodes<ts.VariableDeclaration>(
      scriptSourceFile,
      ts.SyntaxKind.VariableDeclaration,
    );

    const memberNames = componentDeclaration.members.map(member =>
      svelte.getDeclarationName(member),
    );
    const declarationNames = declarations.map(identifier =>
      svelte.getDeclarationName(identifier),
    );

    log(component);

    // this should be recursive
    return component.attributes.reduce(
      (diagnostics, node) => {
        node.parent = component;

        return [
          ...diagnostics,
          ...this.gatherPropertyDiagnostics(
            memberNames,
            declarationNames,
            declarations,
            componentDeclaration,
            compiledSourceFile,
            node,
          ),
        ];
      },
      [] as svelte.Diagnostic[],
    );
  }

  private gatherComponentDiagnostics(
    scriptSourceFile: ts.SourceFile,
    compiledSourceFile: ts.SourceFile,
    node: svelte.Node,
  ): svelte.Diagnostic[] {
    const componentNodes = svelte.getComponents(node);
    const diagnostics: svelte.Diagnostic[] = [];

    const getComponentNode = (
      node: ts.ImportClause | ts.ImportSpecifier,
    ): svelte.Component =>
      componentNodes.find(
        ({ name }) => name === svelte.getDeclarationName(node),
      );

    const removeComponentNode = (
      componentNode: svelte.Component,
    ): svelte.Component[] =>
      componentNodes.splice(componentNodes.indexOf(componentNode), 1);

    if (componentNodes.length) {
      const allImports = svelte.getAllImports(scriptSourceFile);
      const componentImports = new Map<
        svelte.Component,
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
        const messageText = svelte.formatDiagnosticMessageTexts([
          // Identifier
          `Import declaration for '${component.name}' cannot be found.`,
        ]);

        diagnostics.push({
          file: compiledSourceFile,
          category: ts.DiagnosticCategory.Error,
          start: component.start,
          length: component.end - component.start,
          code: component.type,
          messageText,
        });
      });

      for (const [componentNode, declaration] of componentImports.entries()) {
        const type = this.typeChecker.getTypeAtLocation(declaration);
        const componentDeclaration = svelte.findComponentDeclaration(
          type.symbol.declarations,
        );
        // TODO: Type check if import is a class which extends SvelteComponent/SvelteComponentDev
        // TODO: Type check methods
        // TODO: Type check props

        if (componentDeclaration) {
          // @ts-ignore
          diagnostics.push(
            ...this.gatherComponentPropertyDiagnostics(
              scriptSourceFile,
              compiledSourceFile,
              componentDeclaration,
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

  // private gatherIfBlockDiagnostics(node: IfBlock) {}

  private getCompiledSourceFile(
    sourceFile: ts.SourceFile,
    compiledSource: string,
  ): ts.SourceFile {
    const fileName = svelte.getInputFileFromOutputFile(
      sourceFile.fileName,
      this.bazelBin,
      this.bazelHost.inputFiles,
    );

    const source = this.bazelHost
      .readFile(fileName)
      .replace(svelte.SCRIPT_TAG, `<script>${compiledSource}</script>`);

    return ts.createSourceFile(fileName, source, this.compilerOpts.target);
  }

  private gatherNodeDiagnostics(
    sourceFile: ts.SourceFile,
    compiledSvelteFile: ts.SourceFile,
    node: svelte.Node,
  ): svelte.Diagnostic[] {
    const diagnostics: svelte.Diagnostic[] = [];

    if (svelte.isInlineComponent(node)) {
      diagnostics.push(
        ...this.gatherComponentDiagnostics(
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

  gatherAllDiagnostics(scriptSourceFile: ts.SourceFile): ts.Diagnostic[] {
    const [compiledSource, compilation] = this.compilationCache.get(
      scriptSourceFile.fileName,
    );

    const compiledSvelteFile = this.getCompiledSourceFile(
      scriptSourceFile,
      compiledSource,
    );

    const diagnostics: svelte.Diagnostic[] = [];

    if (compilation) {
      // HINT: There'll always be a top level fragment node
      //const fragment = addParentNodeReferences(compilation.ast.html);

      diagnostics.push(
        ...this.gatherNodeDiagnostics(
          scriptSourceFile,
          compiledSvelteFile,
          compilation.ast.html,
        ),
      );
    }

    return <ts.Diagnostic[]>(<unknown>diagnostics);
  }
}

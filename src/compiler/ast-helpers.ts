import { Ast } from 'svelte/types/compiler/interfaces';
import * as ts from 'typescript';

export const SVELTE_COMPONENT_IDENTIFIER = ts.createIdentifier(
  'SvelteComponent',
);

export const SVELTE_COMPONENT_DEV_IDENTIFIER = ts.createIdentifier(
  'SvelteComponentDev',
);

export function getSvelteComponentIdentifier(devMode = true): ts.Identifier {
  return devMode
    ? SVELTE_COMPONENT_DEV_IDENTIFIER
    : SVELTE_COMPONENT_IDENTIFIER;
}

export function createSvelteComponentImport(
  devMode: boolean,
): ts.ImportDeclaration {
  const namedImports = ts.createNamedImports([
    ts.createImportSpecifier(undefined, getSvelteComponentIdentifier(devMode)),
  ]);

  const importClause = ts.createImportClause(undefined, namedImports);

  return ts.createImportDeclaration(
    undefined,
    undefined,
    importClause,
    ts.createLiteral('svelte/internal'),
  );
}

export function functionDeclarationToMethodDeclaration(
  fn: ts.FunctionDeclaration,
): ts.MethodDeclaration {
  return ts.createMethod(
    fn.decorators,
    undefined,
    undefined,
    fn.name,
    fn.questionToken,
    fn.typeParameters,
    fn.parameters,
    fn.type,
    undefined,
  );
}

export function variableStatementToPropertyDeclaration(
  checker: ts.TypeChecker,
  variable: ts.VariableStatement,
): ts.PropertyDeclaration {
  const {
    name: {
      parent: { symbol, initializer },
    },
    exclamationToken,
  } = variable.declarationList.declarations[0] as any;
  const type = checker.getTypeOfSymbolAtLocation(symbol, variable);

  return ts.createProperty(
    variable.decorators,
    undefined,
    symbol.escapedName as string,
    exclamationToken,
    checker.typeToTypeNode(type),
    undefined, //initializer,
  );
}

export function collectDeepNodes<T extends ts.Node>(
  node: ts.Node,
  kind: ts.SyntaxKind | ts.SyntaxKind[],
): T[] {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const nodes: T[] = [];

  const helper = (child: ts.Node) => {
    if (kinds.includes(child.kind)) {
      nodes.push(child as T);
    }

    ts.forEachChild(child, helper);
  };

  ts.forEachChild(node, helper);

  return nodes;
}

export function getAllImports(sourceFile: ts.SourceFile) {
  return collectDeepNodes<ts.ImportClause>(
    sourceFile,
    // ts.SyntaxKind.ImportDeclaration,
    ts.SyntaxKind.ImportClause,
  );
}

export function getAllComponentNames(node: Ast['html']): string[] {
  const components: string[] = [];

  if (node.type === 'InlineComponent') {
    components.push(node.name);
  }

  (node.children || []).forEach(child => {
    components.push(...getAllComponentNames(child));
  });

  return components;
}

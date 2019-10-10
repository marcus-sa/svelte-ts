import * as ts from 'typescript';
import { log } from '@bazel/typescript';

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

export function getAllExports(sourceFile: ts.SourceFile) {
  return collectDeepNodes<ts.ExportDeclaration>(
    sourceFile,
    ts.SyntaxKind.ExportDeclaration,
  );
}

export function getAllImports(sourceFile: ts.SourceFile) {
  return collectDeepNodes<ts.ImportDeclaration>(
    sourceFile,
    ts.SyntaxKind.ImportDeclaration,
  );
}

export function findComponentDeclaration(
  declarations: ts.Declaration[],
): ts.ClassDeclaration | null {
  return declarations.find(decl =>
    ts.isClassDeclaration(decl),
  ) as ts.ClassDeclaration;
}

export function getDeclarationName(node: ts.NamedDeclaration): string | null {
  return ts.isIdentifier(node.name) ? (node.name.escapedText as string) : null;
}

export function getIdentifierName(node: any): string | null {
  if (typeof node.escapedText === 'string') {
    return node.escapedText as string;
  } else if (node.name && typeof node.name.escapedText === 'string') {
    return node.name.escapedText as string;
  }

  return null;
}

/*export function getTypeSymbolDeclarationPropertyNames(type: ts.Type): string[] {
  return type.symbol.declarations.reduce((names, { properties }) => [...names, ...properties.map(property => getIdentifierName(property))], []);
}*/

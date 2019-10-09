import * as ts from 'typescript';

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

export function findClassDeclaration(
  declarations: ts.Declaration[],
): ts.ClassDeclaration | null {
  return declarations.find(decl =>
    ts.isClassDeclaration(decl),
  ) as ts.ClassDeclaration;
}

export function getTextFromNamedDeclaration(node: ts.NamedDeclaration): string {
  return (node.name as ts.Identifier).escapedText as string;
}

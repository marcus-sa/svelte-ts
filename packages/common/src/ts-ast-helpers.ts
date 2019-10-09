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

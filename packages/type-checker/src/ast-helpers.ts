import { MustacheTag, Node, Transition, Identifier } from './interfaces';
import { IfBlock, InlineComponent } from './nodes';

export function getInlineComponents(node: Node): InlineComponent[] {
  const components: InlineComponent[] = [];

  if (isInlineComponent(node)) {
    components.push(node);
  }

  (node.children || []).forEach(child => {
    components.push(...getInlineComponents(child));
  });

  return components;
}

export function addParentNodeReferences(node: Node): Node {
  if (node.children) {
    node.children.forEach(child => {
      child.parent = node;
      addParentNodeReferences(child);
    });
  }

  return node;
}

export function isInlineComponent(node: Node): node is InlineComponent {
  return node.type === 'InlineComponent';
}

export function isFragment(node: Node): node is Transition {
  return node.type === 'Fragment';
}

export function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier';
}

export function isIfBlock(node: Node): node is IfBlock {
  return node.type === 'IfBlock';
}

/*export function isMemberExpression(node: Node): node is MemberExpression

export function isUnaryExpression(node: Node): node is UnaryExpression {

}*/

export function isMustacheTag(node: Node): node is MustacheTag {
  return node.type === 'MustacheTag';
}

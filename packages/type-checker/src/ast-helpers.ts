import InlineComponent from 'svelte/types/compiler/compile/nodes/InlineComponent';

import { MustacheTag, Node, Transition, Identifier } from './interfaces';

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

export function isInlineComponent(node: Node): node is InlineComponent {
  return node.type === 'InlineComponent';
}

export function isFragment(node: Node): node is Transition {
  return node.type === 'Fragment';
}

export function isIdentifier(node: Node): node is Identifier {
  return node.type === 'Identifier';
}

export function isMustacheTag(node: Node): node is MustacheTag {
  return node.type === 'MustacheTag';
}

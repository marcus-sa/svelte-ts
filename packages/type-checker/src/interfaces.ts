import { Transition, Text } from 'svelte/types/compiler/interfaces';

export interface Node {
  start: number;
  end: number;
  type: string;
  children?: Node[];
  parent?: Node;
  [prop: string]: any;
}

export interface Identifier extends Node {
  type: 'Identifier';
  name: string;
}

export interface AttributeShorthand extends Node {
  type: 'AttributeShortHand';
  expression: Identifier;
}

export interface Attribute extends Node {
  type: 'Attribute';
  name: string;
  // Can be mostly anything
  value: Node[];
}

export interface Spread extends Node {
  type: 'Spread';
  expression: Identifier;
}

export interface MustacheTag extends Node {
  type: 'MustacheTag';
  // Identifier
  expression: Node | Identifier;
}

export { Transition };

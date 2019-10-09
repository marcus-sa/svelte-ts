import { MustacheTag, Transition } from 'svelte/types/compiler/interfaces';

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

export { MustacheTag, Transition };

import {
  MustacheTag,
  Node,
  Transition,
} from 'svelte/types/compiler/interfaces';

export interface Identifier {
  type: 'Identifier';
  start: number;
  end: number;
  name: string;
}

export { MustacheTag, Node, Transition };

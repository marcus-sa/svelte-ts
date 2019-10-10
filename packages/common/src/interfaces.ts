import { Transition, CompileOptions } from 'svelte/types/compiler/interfaces';
import { compile } from 'svelte/compiler';
import * as ts from 'typescript';

export interface CompilerOptions extends CompileOptions {
  expectedOuts: string[];
  suppressWarnings: string[];
}

export type Compilation = ReturnType<typeof compile>;

export type CompilationCache = Map<string, [string, Compilation]>;

export interface Diagnostic
  extends Omit<ts.DiagnosticRelatedInformation, 'code' | 'messageText'> {
  code: string | number;
  messageText: string | DiagnosticMessageChain;
}

export interface DiagnosticMessageChain
  extends Omit<ts.DiagnosticMessageChain, 'code' | 'next'> {
  code: string | number;
  next?: DiagnosticMessageChain;
}

export interface Node {
  start: number;
  end: number;
  type: string;
  children?: Node[];
  parent?: Node;
  [prop: string]: any;
}

export interface InlineComponent extends Node {
  type: 'InlineComponent';
  name: string;
  attributes: Attribute[];
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

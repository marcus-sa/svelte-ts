import { CompileOptions } from 'svelte/types/compiler/interfaces';
import { compile } from 'svelte/compiler';
import * as ts from 'typescript';

export interface SvelteCompilerOptions extends CompileOptions {
  expectedOuts: string[];
  suppressWarnings: string[];
}

export type SvelteCompilation = ReturnType<typeof compile>;

export type SvelteCompilationCache = Map<string, [string, SvelteCompilation]>;

export interface SvelteDiagnostic
  extends Omit<ts.DiagnosticRelatedInformation, 'code' | 'messageText'> {
  code: string | number;
  messageText: string | SvelteDiagnosticMessageChain;
}

export interface SvelteDiagnosticMessageChain
  extends Omit<ts.DiagnosticMessageChain, 'code' | 'next'> {
  code: string | number;
  next?: SvelteDiagnosticMessageChain;
}

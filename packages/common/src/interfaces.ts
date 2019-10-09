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
  extends Omit<ts.DiagnosticRelatedInformation, 'code'> {
  code: string;
}

import { CompileOptions } from 'svelte/types/compiler/interfaces';
import { compile } from 'svelte/compiler';

export interface SvelteCompilerOptions extends CompileOptions {
  expectedOuts: string[];
  suppressWarnings: string[];
}

export type SvelteCompilation = ReturnType<typeof compile>;

export type SvelteTemplateCache = Map<string, SvelteCompilation>;

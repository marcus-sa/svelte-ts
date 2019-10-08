import { CompileOptions } from 'svelte/types/compiler/interfaces';

export interface SvelteCompilerOptions extends CompileOptions {
  expectedOuts: string[];
  suppressWarnings: string[];
}

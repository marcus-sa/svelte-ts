import {
  CachedFileLoader,
  FileCache,
  FileLoader,
  resolveNormalizedPath,
  UncachedFileLoader,
} from '@bazel/typescript';
import * as path from 'path';
import * as ts from 'typescript';

export const BAZEL_BIN = /\b(blaze|bazel)-out\b.*?\bbin\b/;
export const SVELTE_JS_EXT = /(.svelte.js)$/g;
export const SCRIPT_TAG = /<script(\s[^]*?)?>([^]*?)<\/script>/gi;
export const MISSING_DECLARATION = /'(.*?)'/;

export function isSvelteOutputFile(fileName: string): boolean {
  return SVELTE_JS_EXT.test(fileName);
}

export function isSvelteInputFile(fileName: string): boolean {
  return fileName.endsWith('.svelte');
}

export function createFileLoader(
  fileCache: FileCache,
  inputs?: Record<string, string>,
): FileLoader {
  if (!inputs) {
    return new UncachedFileLoader();
  }

  const fileLoader = new CachedFileLoader(fileCache);
  // Resolve the inputs to absolute paths to match TypeScript internals
  const resolvedInputs = new Map<string, string>();
  const inputKeys = Object.keys(inputs);

  inputKeys.forEach(key => {
    resolvedInputs.set(resolveNormalizedPath(key), inputs[key]);
  });

  fileCache.updateCache(resolvedInputs);

  return fileLoader;
}

export function relativeToRootDirs(
  filePath: string,
  rootDirs: string[],
): string {
  if (!filePath) return filePath;
  // NB: the rootDirs should have been sorted longest-first
  for (let i = 0; i < rootDirs.length; i++) {
    const dir = rootDirs[i];
    const rel = path.posix.relative(dir, filePath);
    if (rel.indexOf('.') != 0) return rel;
  }

  return filePath;
}

export function hasErrors(diagnostics: ReadonlyArray<ts.Diagnostic>) {
  return diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
}

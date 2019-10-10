import * as path from 'path';
import {
  CachedFileLoader,
  FileCache,
  FileLoader,
  resolveNormalizedPath,
  UncachedFileLoader,
} from '@bazel/typescript';

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

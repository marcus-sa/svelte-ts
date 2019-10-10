import * as path from 'path';
import * as ts from 'typescript';

export const BAZEL_BIN = /\b(blaze|bazel)-out\b.*?\bbin\b/;
export const JS_EXT = /(.svelte.js)$/g;
export const DTS_EXT = /(.svelte.d.ts)$/;
export const FILE_EXT = /(.svelte.(d.ts|js))$/g;
export const SCRIPT_TAG = /<script(\s[^]*?)?>([^]*?)<\/script>/gi;
export const STYLE_TAG = /<style(\s[^]*?)?>([^]*?)<\/style>/gi;
export const FILE_COMPONENT_NAME = /(.*?).svelte.(d.ts|js)$/;
export const MISSING_DECLARATION = /'(.*?)'/;

export function isOutputFile(fileName: string): boolean {
  return JS_EXT.test(fileName);
}

export function isDeclarationFile(fileName: string): boolean {
  return DTS_EXT.test(fileName);
}

export function isInputFile(fileName: string): boolean {
  return fileName.endsWith('.svelte');
}

export function getNameFromPath(fileName: string): string {
  return path.basename(fileName).match(FILE_COMPONENT_NAME)[1];
}

export function getTemplateFromSource(source: string): string {
  return source.replace(SCRIPT_TAG, '').replace(STYLE_TAG, '');
}

export function hasDiagnosticsErrors(
  diagnostics: ReadonlyArray<ts.Diagnostic>,
) {
  return diagnostics.some(d => d.category === ts.DiagnosticCategory.Error);
}

export function getInputFileFromOutputFile(
  fileName: string,
  bazelBin: string,
  files: string[],
): string | null {
  const relativeSourceFilePath = fileName
    .replace(bazelBin, '')
    .replace(FILE_EXT, '.svelte');

  return files.find(file => file.endsWith(relativeSourceFilePath));
}

export function formatDiagnosticMessageTexts(messages: string[]): string {
  let tabs = '  ';

  return messages.reduce((message, next) => {
    message += '\n' + tabs + next;
    tabs += '  ';
    return message;
  }, '');
}

import * as ts from 'typescript';

export const defaultCompilerOptions: ts.CompilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ES2015,
  moduleResolution: ts.ModuleResolutionKind.NodeJs,
  //alwaysStrict: false,
  inlineSourceMap: false,
  sourceMap: true,
  allowNonTsExtensions: true,
};

import * as ts from 'typescript';
import * as svelte from '@svelte-ts/common';
import { SvelteTypeChecker } from '@svelte-ts/type-checker';
import { SvelteCompiler } from '@svelte-ts/compiler';
import { DirectoryJSON, Volume } from 'memfs/lib/volume';

export interface Template {
  name: string;
  html: string;
  script: string;
}

export interface File {
  name: string;
  content: string;
}

export type VirtualFile = Template | File;

function isTemplate(file: any): file is Template {
  return (
    typeof file === 'object' &&
    file.name !== '' &&
    (file.script !== '' || file.html !== '')
  );
}

export class SvelteCompilerHost implements ts.CompilerHost {
  private readonly sourceFileCache = new Map<string, ts.SourceFile>();
  private readonly delegate: ts.CompilerHost;
  private readonly vfs: Volume;

  constructor(
    private readonly options: ts.CompilerOptions,
    private readonly files: VirtualFile[],
  ) {
    this.delegate = ts.createCompilerHost(options, true);
    this.vfs = Volume.fromJSON(this.createDirectoryVolumeFromFiles(files));
  }

  private createDirectoryVolumeFromFiles(files: VirtualFile[]): DirectoryJSON {
    return files.reduce(
      (files, file) => ({
        ...file,
        [file.name]: isTemplate(file)
          ? `
        <script>${file.script}</script>
        ${file.html} 
      `
          : file.content,
      }),
      {} as DirectoryJSON,
    );
  }

  readFile(fileName: string): string | undefined {
    if (this.files.some(file => file.name === fileName)) {
      return this.vfs.readFileSync(fileName).toString();
    }

    return this.delegate.readFile(fileName);
  }

  writeFile(
    fileName: string,
    content: string,
    writeByteOrderMark: boolean,
    onError?: (message: string) => void,
    sourceFiles?: ts.SourceFile[],
  ): void {
    this.vfs.writeFileSync(fileName, content);
  }

  fileExists(fileName: string): boolean {
    return this.vfs.existsSync(fileName) || this.delegate.fileExists(fileName);
  }

  getCanonicalFileName(fileName: string): string {
    return this.delegate.getCanonicalFileName(fileName);
  }

  getCurrentDirectory(): string {
    return this.delegate.getCurrentDirectory();
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return this.delegate.getDefaultLibFileName(options);
  }

  getNewLine(): string {
    return this.delegate.getNewLine();
  }

  getSourceFile(
    fileName: string,
    languageVersion: ts.ScriptTarget,
    onError?: (message: string) => void,
    shouldCreateNewSourceFile?: boolean,
  ): ts.SourceFile | undefined {
    if (this.sourceFileCache.has(fileName)) {
      return this.sourceFileCache.get(fileName);
    }

    const source = this.readFile(fileName);

    console.log(fileName);

    const sourceFile = ts.createSourceFile(fileName, source, languageVersion);
    this.sourceFileCache.set(fileName, sourceFile);

    return sourceFile;
  }

  useCaseSensitiveFileNames(): boolean {
    return this.delegate.useCaseSensitiveFileNames();
  }
}

export class SvelteTestCompiler extends SvelteCompiler {
  protected readonly options: svelte.CompilerOptions = {
    expectedOuts: [],
    suppressWarnings: [],
  };

  constructor(
    protected readonly svelteCompilationCache: svelte.CompilationCache,
    protected readonly compilerOpts: ts.CompilerOptions,
    protected readonly tsHost: SvelteCompilerHost,
    protected readonly files: string[],
    protected readonly rootDir: string,
  ) {
    super();
  }

  compile() {
    const originalWriteFile = this.tsHost.writeFile.bind(this.tsHost);
    this.tsHost.writeFile = (
      fileName: string,
      content: string,
      writeByteOrderMark: boolean,
      onError?: (message: string) => void,
      sourceFiles?: ts.SourceFile[],
    ) => {
      if (svelte.isOutputFile(fileName)) {
        content = this.compileSvelteSource(fileName, content);
      }

      if (svelte.isDeclarationFile(fileName)) {
        content = this.createSvelteComponentDeclarationSource(
          fileName,
          sourceFiles[0],
        );
      }

      originalWriteFile(
        fileName,
        content,
        writeByteOrderMark,
        onError,
        sourceFiles,
      );
    };

    const originalGetSourceFile = this.tsHost.getSourceFile.bind(this.tsHost);
    this.tsHost.getSourceFile = (
      fileName: string,
      target: ts.ScriptTarget,
    ): ts.SourceFile => {
      console.log(fileName);

      if (svelte.isInputFile(fileName)) {
        return this.createSvelteSourceFile(fileName, target);
      }

      return originalGetSourceFile(fileName, target);
    };

    this.program = ts.createProgram({
      rootNames: this.files,
      options: svelte.defaultCompilerOptions,
      host: this.tsHost,
    });

    this.program.emit();

    return new SvelteTypeChecker(
      this.tsHost,
      this.program.getTypeChecker(),
      '',
      this.files,
      svelte.defaultCompilerOptions,
      this.svelteCompilationCache,
    );
  }
}

export function createTestingTypeChecker(files: VirtualFile[]) {
  const tsHost = new SvelteCompilerHost(svelte.defaultCompilerOptions, files);
  const svelteCompilationCache: svelte.CompilationCache = new Map();

  const compiler = new SvelteTestCompiler(
    svelteCompilationCache,
    svelte.defaultCompilerOptions,
    tsHost,
    files.map(file => file.name),
    '',
  );

  return compiler.compile();
}

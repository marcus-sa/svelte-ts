import { log, runAsWorker, runWorkerLoop } from '@bazel/typescript';

import { SvelteBazelCompiler } from './svelte-bazel-compiler';

function main(args: string[]): number {
  if (runAsWorker(args)) {
    runWorkerLoop((args, inputs) => {
      const svelteBazelCompiler = new SvelteBazelCompiler(args, inputs);
      return svelteBazelCompiler.compile();
    });
  } else {
    const svelteBazelCompiler = new SvelteBazelCompiler(args);
    return svelteBazelCompiler.compile() ? 0 : 1;
  }

  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

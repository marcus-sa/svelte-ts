import svelte from 'rollup-plugin-svelte';

export default {
  input: __dirname + '/App.svelte',
  output: {
    file: __dirname + '/bundle.js',
    name: 'BazelSvelteTest',
    format: 'iife',
  },
  plugins: [
    svelte({
      include: __dirname + '/**/*.svelte',
      //css: false
    }),
  ]
}
<script lang="typescript">
  import Button from './Button';

  export const hello: string = 'Hello world';
</script>

<style lang="scss">
  p {
    color: red;
  }

  :global(body) {
		/* this will apply to <body> */
		margin: 0;
  }
</style>

<Button>
  { hello }
</Button>

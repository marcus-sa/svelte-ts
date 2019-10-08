<script lang="typescript">
  import { Button } from './Button/#index';

  export const hello: string = 'Hello world';

  let icon = 'user';
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

<button lol="{icon}">
  { hello }
</button>

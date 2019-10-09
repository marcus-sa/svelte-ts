<script lang="typescript">
  import { Button } from './Button';

  export const hello = 'Hello world';

  // let icon = 'user';
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

<button icon="{icon}">
  { hello }
</button>

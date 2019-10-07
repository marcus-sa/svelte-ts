<script lang="typescript">
  import Button from './Button';

  import ApolloClient from 'apollo-boost';
  import { setClient } from 'svelte-apollo';

  const client = new ApolloClient({
    uri: ''
  });

  setClient(client);

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
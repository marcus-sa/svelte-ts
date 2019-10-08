<script lang="typescript">
  import { TriggerOptions } from './trigger-options.interface';

  export let icon: string = 'Hello';
	export let text: number = 2;
	export let options: TriggerOptions;

  export function trigger(options: TriggerOptions) {
    console.log('hello');
  }
</script>

<button>
  <slot></slot>
</button>

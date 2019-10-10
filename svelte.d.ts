declare module '*.svelte' {
  import { SvelteComponent } from 'svelte/internal';

  export type Props = Record<string, any>;

  export interface ComponentOptions {
    target: Element;
    anchor?: Element;
    props?: Props;
    hydrate?: boolean;
    intro?: boolean;
  }

  export default class extends SvelteComponent {
    constructor(options: ComponentOptions);
  }
}

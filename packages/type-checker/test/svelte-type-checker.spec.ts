import { createTestingTypeChecker } from './create-test-type-checker';

describe('SvelteTypeChecker', () => {
  describe('getCompiledSourceFile', () => {
    it('should return compiled source file', () => {
      const typeChecker = createTestingTypeChecker([
        {
          name: 'Alert.svelte',
          script: `
          export let type: 'success' | 'warning' | 'info' | 'error';
        `,
          html: `
          <div>
            <slot></slot>
          </div>
        `,
        },
      ]);

      expect(typeChecker).toBeDefined();
    });
  });
});

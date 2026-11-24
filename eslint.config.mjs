import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/.learnlab/**']
  },
  {
    rules: {
      // `const { labId: _, ...rest } = obj` 是有意丢弃字段的写法，`_` 未用属正常；
      // 统一用 `_` 前缀表示「故意不用的变量/参数」。
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_'
        }
      ]
    }
  }
);

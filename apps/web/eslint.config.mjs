import base from '@casino/config/eslint';
import globals from 'globals';

export default [
  ...base,
  { files: ['**/*.{ts,tsx}'], languageOptions: { globals: { ...globals.browser } } },
];

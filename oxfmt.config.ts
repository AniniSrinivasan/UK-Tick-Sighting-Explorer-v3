import type { OxfmtConfig } from 'oxfmt'

// configure project code formatting
export default {
  ignorePatterns: ['tsconfig.json'],
  printWidth: 100,
  semi: false,
  singleQuote: true,
  sortPackageJson: false,
  trailingComma: 'all',
} satisfies OxfmtConfig

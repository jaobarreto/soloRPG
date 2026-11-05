module.exports = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.ts'],
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/test/integration/'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/database/schema.ts',
    '!src/database/game-schema.ts',
    '!src/database/narrative-schema.ts',
    '!src/database/adventure-schema.ts',
    '!src/database/arcana-schema.ts',
    '!src/game-engine/admin.ts',
    '!src/adventures/admin.ts',
  ],
};

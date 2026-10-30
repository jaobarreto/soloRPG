module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: [],
  testTimeout: 30000,
};

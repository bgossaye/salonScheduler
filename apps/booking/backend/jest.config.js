module.exports = {
  testEnvironment: 'node',
  // mongodb-memory-server downloads/boots a real (ephemeral) mongod, which
  // is slower than a mocked DB but tests real Mongoose behavior (indexes,
  // transactions, query semantics) instead of a fake. Integration tests
  // that need it live in tests/integration and get more time.
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 20000,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // Keep coverage focused on the logic worth protecting first (see
  // TESTING.md) rather than demanding 100% across the whole codebase.
  collectCoverageFrom: [
    'utils/appointmentIntegrity.js',
    'utils/promotions.js',
  ],
};

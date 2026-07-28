/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 4,
  // The supertest suites boot the express app and verify real ECDSA auth chains,
  // which overruns jest's 5s default on a loaded machine and fails unrelated tests.
  testTimeout: 30000,
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/test/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
}

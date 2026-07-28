module.exports = {
  maxWorkers: 4,
  // The supertest suites boot the express app and verify real ECDSA auth chains,
  // which overruns jest's 5s default on a loaded machine and fails unrelated tests.
  testTimeout: 30000,
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  setupFilesAfterEnv: ["<rootDir>/spec/setupTests.ts"],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/test/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
}

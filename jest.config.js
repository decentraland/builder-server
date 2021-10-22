module.exports = {
  maxWorkers: 4,
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
}

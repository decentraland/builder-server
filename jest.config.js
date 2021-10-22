/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  globals: {
    'ts-jest': {
      isolatedModules: true
    },
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 4,
  transform: {
    "^.+\\.(t|j)sx?$": "@swc/jest"
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)',
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
  ],
}

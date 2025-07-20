module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/server/**/*.test.js'],
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/node_modules/**'
  ],
  setupFilesAfterEnv: [],
  testTimeout: 10000
};
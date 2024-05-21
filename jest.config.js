module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testRegex: '(/__tests__/.*|(\\.|/)(test))\\.[jt]sx?$',
  fakeTimers: {
    enableGlobally: true,
    now: new Date('2022-09-01T09:00:00.000+00:00').getTime(),
  },
  testPathIgnorePatterns: ['/node_modules/', '.tmp', '.cache'],
  testTimeout: 30_000,
  verbose: true,
  globals: {
    strapi: true,
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        strapi: true,
      },
    ],
  },
};

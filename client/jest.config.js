/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/*.test.{ts,tsx}'
  ],
  moduleNameMapper: {
    '^components$': '<rootDir>/src/shared/components',
    '^components/(.*)$': '<rootDir>/src/shared/components/$1',
    '^client/(.*)$': '<rootDir>/src/$1',
    '^shared/(.*)$': '<rootDir>/src/shared/$1',
    '^core/(.*)$': '<rootDir>/../core/$1',
    '^admin/(.*)$': '<rootDir>/src/admin/$1',
    '^game/(.*)$': '<rootDir>/src/game/$1',
    '^page/(.*)$': '<rootDir>/src/page/$1',
    '^users/(.*)$': '<rootDir>/src/users/$1',
    '^resources/(.*)$': '<rootDir>/src/resources/$1'
  },
  transform: {
    '^.+\\.{ts,tsx}$': ['ts-jest', {
      tsconfig: 'tsconfig.app.json'
    }]
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts'
  ]
};
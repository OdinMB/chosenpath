/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  modulePaths: ['<rootDir>/tests/__mocks__'],
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/*.test.{ts,tsx}'
  ],
  moduleNameMapper: {
    // Mock CSS imports
    '\\.(css|less|scss|sass)$': '<rootDir>/tests/__mocks__/styleMock.js',
    // Handle .js extensions in imports
    '^(.*)\\.js$': '$1',
    // Map all the path aliases
    '^components$': '<rootDir>/src/shared/components/index',
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
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        skipLibCheck: true,
        moduleResolution: 'node',
        allowJs: true,
        resolveJsonModule: true,
        isolatedModules: true
      }
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@langchain|langchain)/)'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts'
  ],
  setupFiles: ['<rootDir>/tests/setupViteEnv.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts']
};
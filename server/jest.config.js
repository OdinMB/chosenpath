/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
  moduleNameMapper: {
    // Ensure .cjs/.mjs relative imports are not remapped by the preset's .js rule
    "^(\\.\\.?/.*)\\.cjs$": "$1.cjs",
    "^(\\.\\.?/.*)\\.mjs$": "$1.mjs",
    // Jest uses source files, not dist
    "^core/(.*).js$": "<rootDir>/../core/$1",
    "^core/(.*)$": "<rootDir>/../core/$1",
    "^server/(.*).js$": "<rootDir>/src/$1",
    "^server/(.*)$": "<rootDir>/src/$1",
    "^shared/(.*).js$": "<rootDir>/src/shared/$1",
    "^shared/(.*)$": "<rootDir>/src/shared/$1",
    "^game/(.*).js$": "<rootDir>/src/game/$1",
    "^game/(.*)$": "<rootDir>/src/game/$1",
    "^stories/(.*).js$": "<rootDir>/src/stories/$1",
    "^stories/(.*)$": "<rootDir>/src/stories/$1",
    "^templates/(.*).js$": "<rootDir>/src/templates/$1",
    "^templates/(.*)$": "<rootDir>/src/templates/$1",
    "^users/(.*).js$": "<rootDir>/src/users/$1",
    "^users/(.*)$": "<rootDir>/src/users/$1",
    "^images/(.*).js$": "<rootDir>/src/images/$1",
    "^images/(.*)$": "<rootDir>/src/images/$1",
    "^feedback/(.*).js$": "<rootDir>/src/feedback/$1",
    "^feedback/(.*)$": "<rootDir>/src/feedback/$1",
    // Only strip .js from relative imports within our source/tests, not from node_modules
    "^(?!.*node_modules)(\\.\\.?/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          allowJs: true,
          isolatedModules: true,
          skipLibCheck: true,
          types: ["jest", "node"],
        },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  moduleFileExtensions: ["ts", "tsx", "js", "json", "cjs", "mjs"],
  moduleDirectories: ["node_modules", "<rootDir>/src", "<rootDir>/../core"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/index.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup.js"],
  testTimeout: 10000,
  testEnvironmentOptions: {
    customExportConditions: ["node", "node-addons"],
  },
};

// Global test setup

// Mock environment variables for testing
process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_DATABASE = "chosenpath_test";
process.env.DB_USER = "testuser";
process.env.DB_PASSWORD = "testpass";
process.env.OPENAI_API_KEY = "test-key-123";
process.env.CORS_ORIGIN = "http://localhost:5173";

// Global test timeout (Jest CLI already sets by config)

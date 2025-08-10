// Simple test to verify Jest setup works
import { describe, test, expect } from "@jest/globals";

describe("Simple Test Suite", () => {
  test("Basic Jest functionality works", () => {
    expect(1 + 1).toBe(2);
    expect("hello").toBe("hello");
    expect(true).toBe(true);
  });

  test("Async operations work", async () => {
    const result = await Promise.resolve("async-test");
    expect(result).toBe("async-test");
  });

  test("Environment variables are set correctly", () => {
    expect(process.env.NODE_ENV).toBe("test");
    // VITE_WS_PORT may not be set in test environment
    expect(process.env.VITE_WS_PORT || "3000").toBe("3000");
  });

  test("Objects and arrays work correctly", () => {
    const testObj = { name: "test", value: 42 };
    const testArr = [1, 2, 3];

    expect(testObj).toHaveProperty("name");
    expect(testObj.name).toBe("test");
    expect(testArr).toHaveLength(3);
    expect(testArr[0]).toBe(1);
  });
});
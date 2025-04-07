/**
 * Client-side logger utility
 * Simple logging utility for consistent console output in the client app
 */

// Logger namespaces/categories
type LoggerCategory = "Admin" | "Story" | "WebSocket" | "UI" | "App";

// Log message colors (for browsers that support CSS in console)
const COLORS = {
  Admin: "color: #f59e0b; font-weight: bold", // Amber
  Story: "color: #8b5cf6; font-weight: bold", // Purple
  WebSocket: "color: #0ea5e9; font-weight: bold", // Sky blue
  UI: "color: #10b981; font-weight: bold", // Emerald
  App: "color: #6366f1; font-weight: bold", // Indigo
};

/**
 * Creates a logger for a specific category
 */
const createLogger = (category: LoggerCategory) => {
  const prefix = `[${category}]`;
  const style = COLORS[category];

  return {
    log(message: string, ...data: unknown[]): void {
      if (data.length > 0) {
        console.log(`%c${prefix} ${message}`, style, ...data);
      } else {
        console.log(`%c${prefix} ${message}`, style);
      }
    },

    warn(message: string, ...data: unknown[]): void {
      if (data.length > 0) {
        console.warn(`%c${prefix} ${message}`, style, ...data);
      } else {
        console.warn(`%c${prefix} ${message}`, style);
      }
    },

    error(message: string, error?: unknown): void {
      if (error) {
        console.error(`%c${prefix} ${message}`, style, error);
      } else {
        console.error(`%c${prefix} ${message}`, style);
      }
    },

    info(message: string, ...data: unknown[]): void {
      if (data.length > 0) {
        console.info(`%c${prefix} ${message}`, style, ...data);
      } else {
        console.info(`%c${prefix} ${message}`, style);
      }
    },
  };
};

// Export the logger with pre-defined categories
export const Logger = {
  Admin: createLogger("Admin"),
  Story: createLogger("Story"),
  WebSocket: createLogger("WebSocket"),
  UI: createLogger("UI"),
  App: createLogger("App"),
};

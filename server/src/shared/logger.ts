import { inspect } from "util";

// Color constants
const COLORS = {
  RESET: "\x1b[0m",
  QUEUE: "\x1b[36m", // Cyan (existing)
  WEBSOCKET: "\x1b[31m", // Red
  STORY: "\x1b[35m", // Magenta
  CONNECTION: "\x1b[35m", // Magenta (same as Story)
  ADMIN: "\x1b[33m", // Yellow for admin-related logs
  ROUTE: "\x1b[34m", // Blue for route-related logs
  DEFAULT: "\x1b[32m", // Green
};

/**
 * Creates a logger for a specific service
 * @param serviceName The name of the service
 * @param color The color to use for logs
 */
function createLogger(serviceName: string, color: string) {
  return {
    log(message: string, ...args: any[]): void {
      if (args.length > 0) {
        const formattedArgs = args.map((arg) =>
          typeof arg === "object"
            ? inspect(arg, { depth: null, colors: true })
            : arg
        );
        console.log(
          `${color}[${serviceName}] ${message}${COLORS.RESET}`,
          ...formattedArgs
        );
      } else {
        console.log(`${color}[${serviceName}] ${message}${COLORS.RESET}`);
      }
    },

    warn(message: string, ...args: any[]): void {
      if (args.length > 0) {
        const formattedArgs = args.map((arg) =>
          typeof arg === "object"
            ? inspect(arg, { depth: null, colors: true })
            : arg
        );
        console.warn(
          `${color}[${serviceName}] ${message}${COLORS.RESET}`,
          ...formattedArgs
        );
      } else {
        console.warn(`${color}[${serviceName}] ${message}${COLORS.RESET}`);
      }
    },

    error(message: string, error?: any): void {
      if (error) {
        const formattedError =
          typeof error === "object"
            ? inspect(error, { depth: null, colors: true })
            : error;
        console.error(
          `${color}[${serviceName}] ${message}${COLORS.RESET}`,
          formattedError
        );
      } else {
        console.error(`${color}[${serviceName}] ${message}${COLORS.RESET}`);
      }
    },
  };
}

// Create loggers for each service
export const Logger = {
  ConnectionManager: createLogger("ConnectionManager", COLORS.CONNECTION),
  Websocket: createLogger("Websocket", COLORS.WEBSOCKET),
  Route: createLogger("Route", COLORS.ROUTE),
  Queue: createLogger("Queue", COLORS.QUEUE),
  StoryRepository: createLogger("StoryRepository", COLORS.STORY),
  Admin: createLogger("Admin", COLORS.ADMIN),
  AdminService: createLogger("AdminService", COLORS.ADMIN),
  Story: createLogger("Story", COLORS.STORY),

  // Factory method for other services
  forService(serviceName: string) {
    return createLogger(serviceName, COLORS.DEFAULT);
  },
};

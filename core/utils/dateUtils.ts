/**
 * Format a date string to YYYY-MM-DD format
 * @param dateString - ISO string date to format
 * @returns Formatted date string
 */
export const formatDate = (dateString: string): string => {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);

  // Format: "2025-04-07"
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

/**
 * Format a date string to YYYY-MM-DD HH:MM:SS format
 * @param dateString - ISO string date to format
 * @returns Formatted date and time string
 */
export const formatDateTime = (dateString: string): string => {
  if (!dateString) return "Unknown";

  const date = new Date(dateString);

  // Format: "2025-04-07 14:30:45"
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Format a timestamp to Month Day, Time format
 * @param timestamp - The number of milliseconds since January 1, 1970, 00:00:00 UTC.
 * @returns Formatted date and time string (e.g., "April 7, 2:30 PM")
 */
export const formatTimestampToMonthDayTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const monthName = date.toLocaleString("en-US", { month: "long" });
  const day = date.getDate();
  const time = date.toLocaleString(undefined, { timeStyle: "short" });
  return `${monthName} ${day}, ${time}`;
};

/**
 * Format a timestamp to a human-readable relative time string
 * Examples: "2 days ago", "5 minutes ago", "just now"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const seconds = Math.floor((now - timestamp) / 1000);

  // Handle future dates (shouldn't normally happen)
  if (seconds < 0) {
    return "in the future";
  }

  // Less than a minute
  if (seconds < 60) {
    return "just now";
  }

  // Less than an hour
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  }

  // Less than a day
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  }

  // Less than a week
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }

  // Less than a month (approximation)
  if (seconds < 2592000) {
    const weeks = Math.floor(seconds / 604800);
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  }

  // Format as date
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a timestamp to a detailed date string
 * Format: "2025-04-07, 9:34pm"
 */
export function formatDate(timestamp?: number): string {
  if (!timestamp) return "Never";

  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  let hours = date.getHours();
  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  hours = hours ? hours : 12; // Convert 0 to 12
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}, ${hours}:${minutes}${ampm}`;
}

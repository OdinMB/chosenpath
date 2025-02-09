import { z } from "zod";

export const outcomeStatusEnum = z.enum([
  "not_introduced",
  "introduced",
  "in_progress",
  "resolved",
]);
export type OutcomeStatus = z.infer<typeof outcomeStatusEnum>;

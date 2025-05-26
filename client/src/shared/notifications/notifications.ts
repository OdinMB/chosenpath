import { useContext } from "react";
import { NotificationContext } from "./NotificationContext.js";

export type NotificationType = "error" | "warning" | "info" | "success";

export interface BaseNotification {
  id: string;
  type: NotificationType;
  message: string;
  title?: string;
  autoClose?: boolean;
  duration?: number;
}

export interface ErrorNotification extends BaseNotification {
  type: "error";
  error?: Error;
}

export interface WarningNotification extends BaseNotification {
  type: "warning";
}

export interface InfoNotification extends BaseNotification {
  type: "info";
}

export interface SuccessNotification extends BaseNotification {
  type: "success";
}

export interface RateLimitNotification extends WarningNotification {
  timeRemaining: number;
}

export interface ModerationNotification extends ErrorNotification {
  reason: string;
}

export type Notification =
  | ErrorNotification
  | WarningNotification
  | InfoNotification
  | SuccessNotification
  | RateLimitNotification
  | ModerationNotification;

export interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error(
      "useNotifications must be used within a NotificationProvider"
    );
  }
  return context;
}

import { Notification } from "./notifications";

let notificationCallback:
  | ((notification: Omit<Notification, "id">) => void)
  | null = null;

export const notificationService = {
  setCallback: (callback: (notification: Omit<Notification, "id">) => void) => {
    notificationCallback = callback;
  },
  addNotification: (notification: Omit<Notification, "id">) => {
    if (notificationCallback) {
      notificationCallback(notification);
    } else {
      console.error("No notification callback set! Notification will not be displayed.");
    }
  },
  addErrorNotification: (message?: string) => {
    notificationService.addNotification({
      type: "error",
      title: "Error",
      message: message || "An unexpected error occurred.",
      duration: 5000,
    });
  },
};

import React, {
  createContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { notificationService } from "./notifications/notificationService";
import {
  Notification,
  NotificationContextType,
} from "./notifications/notifications";

const NotificationContext = createContext<NotificationContextType | undefined>(
  undefined
);

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const removeNotificationRef = useRef<(id: string) => void>();

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  removeNotificationRef.current = removeNotification;

  const addNotification = useCallback(
    (notification: Omit<Notification, "id">) => {
      const id = Math.random().toString(36).substring(7);
      const newNotification = { ...notification, id } as Notification;
      setNotifications((prev) => [...prev, newNotification]);

      if (notification.autoClose !== false && notification.duration) {
        setTimeout(() => {
          removeNotificationRef.current?.(id);
        }, notification.duration);
      }
    },
    []
  );

  useEffect(() => {
    notificationService.setCallback(addNotification);
  }, [addNotification]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        clearNotifications,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export { NotificationContext };

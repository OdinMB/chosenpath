import {
  Notification,
  useNotifications,
} from "client/shared/notifications/notifications";
import { Icons } from "../components/ui/Icons";

export function NotificationDisplay() {
  const { notifications, removeNotification } = useNotifications();

  const getIcon = (type: Notification["type"]) => {
    switch (type) {
      case "error":
        return <Icons.Error className="h-5 w-5" />;
      case "warning":
        return <Icons.Warning className="h-5 w-5" />;
      case "success":
        return <Icons.Success className="h-5 w-5" />;
      default:
        return <Icons.Info className="h-5 w-5" />;
    }
  };

  const getBackgroundColor = (type: Notification["type"]) => {
    switch (type) {
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      case "success":
        return "bg-green-50 border-green-200";
      default:
        return "bg-blue-50 border-blue-200";
    }
  };

  const getTextColor = (type: Notification["type"]) => {
    switch (type) {
      case "error":
        return "text-red-800";
      case "warning":
        return "text-yellow-800";
      case "success":
        return "text-green-800";
      default:
        return "text-blue-800";
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-4 max-w-md">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg border ${getBackgroundColor(
            notification.type
          )} shadow-lg flex items-start gap-3`}
        >
          <div className={`flex-shrink-0 ${getTextColor(notification.type)}`}>
            {getIcon(notification.type)}
          </div>
          <div className="flex-1">
            {notification.title && (
              <h3
                className={`font-medium mb-1 ${getTextColor(
                  notification.type
                )}`}
              >
                {notification.title}
              </h3>
            )}
            <p className={`text-sm ${getTextColor(notification.type)}`}>
              {notification.message}
            </p>
            {"reason" in notification && (
              <p className="mt-2 text-sm italic">{notification.reason}</p>
            )}
            {"timeRemaining" in notification && (
              <p className="mt-2 text-sm">
                You can try again in{" "}
                {Math.ceil(notification.timeRemaining / 60000)} minutes.
              </p>
            )}
            {"guidance" in notification && notification.guidance && (
              <div className="mt-2">
                <p className="text-sm font-medium">
                  Suggestion: {notification.guidance}
                </p>
              </div>
            )}
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600"
            aria-label="Close notification"
          >
            <Icons.Close className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}

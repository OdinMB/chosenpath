import { useNavigate } from "react-router-dom";
import { useAuth } from "shared/useAuth";
import { useEffect } from "react";
import { notificationService } from "shared/notifications/notificationService";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/users/signin?view=login");
    } else if (user?.roleId !== "role_admin") {
      notificationService.addNotification({
        type: "error",
        title: "Access Denied",
        message: "You do not have permission to access the admin area.",
        duration: 5000,
      });
      navigate("/");
    }
  }, [isAuthenticated, user, navigate]);

  if (!isAuthenticated || user?.roleId !== "role_admin") {
    return null;
  }

  return <>{children}</>;
}

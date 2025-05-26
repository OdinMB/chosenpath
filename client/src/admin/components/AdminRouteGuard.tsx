import { useNavigate } from "react-router-dom";
import { useAuth } from "client/shared/auth/useAuth";
import { useEffect, useState } from "react";
import { notificationService } from "shared/notifications/notificationService";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Don't do anything while loading
    if (isLoading) {
      return;
    }

    setIsChecking(false);

    if (!isAuthenticated) {
      navigate("/users/signin?view=login");
      return;
    }

    if (user?.roleId !== "role_admin") {
      notificationService.addNotification({
        type: "error",
        title: "Access Denied",
        message: "You do not have permission to access the admin area.",
        duration: 5000,
      });
      navigate("/");
    }
  }, [isAuthenticated, user, navigate, isLoading]);

  // Don't render anything while loading or checking
  if (isLoading || isChecking) {
    return null;
  }

  // Only render children if user is authenticated AND is an admin
  if (!isAuthenticated || user?.roleId !== "role_admin") {
    return null;
  }

  return <>{children}</>;
}

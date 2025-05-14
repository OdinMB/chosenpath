import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "shared/useAuth"; // Assuming useAuth hook is in shared directory

interface UserRouteGuardProps {
  children: React.ReactElement;
}

export const UserRouteGuard: React.FC<UserRouteGuardProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Show a loading indicator while checking auth status
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-8 h-8 border-t-2 border-b-2 border-primary-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect them to the /users/signin page, but save the current location they were
    // trying to go to when they were redirected. This allows us to send them
    // along to that page after they login, which is a nicer user experience
    // than dropping them off on the home page.
    return (
      <Navigate
        to="/users/signin?view=login"
        state={{ from: location }}
        replace
      />
    );
  }

  return children;
};

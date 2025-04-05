import { useState, useEffect, useCallback } from "react";
import { AdminLogin } from "./AdminLogin";
import { AdminDashboard } from "./AdminDashboard";

export const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("admin_token");
    setIsAuthenticated(false);
  }, []);

  // Check for existing auth token on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    if (savedToken) {
      // Validate token with the server
      const validateToken = async (token: string) => {
        try {
          const response = await fetch("/admin/auth", {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            setIsAuthenticated(true);
          } else {
            handleLogout();
          }
        } catch {
          handleLogout();
        }
      };

      validateToken(savedToken);
    }
  }, [handleLogout]);

  const handleLogin = (token: string) => {
    localStorage.setItem("admin_token", token);
    setIsAuthenticated(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {isAuthenticated ? (
        <AdminDashboard onLogout={handleLogout} />
      ) : (
        <AdminLogin onLogin={handleLogin} />
      )}
    </div>
  );
};

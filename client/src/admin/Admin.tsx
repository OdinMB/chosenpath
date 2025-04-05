import { useState, useEffect, useCallback } from "react";
import { AdminLogin } from "./components/AdminLogin";
import { AdminDashboard } from "./components/AdminDashboard";
import { config } from "../config";

export const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("admin_token");
    setAuthToken(null);
    setIsAuthenticated(false);
  }, []);

  // Check for existing auth token on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    if (savedToken) {
      // Validate token with the server
      const validateToken = async (token: string) => {
        try {
          const response = await fetch(`${config.apiUrl}/admin/auth`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (response.ok) {
            setAuthToken(token);
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
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {isAuthenticated && authToken ? (
        <AdminDashboard onLogout={handleLogout} token={authToken} />
      ) : (
        <AdminLogin onLogin={handleLogin} />
      )}
    </div>
  );
};

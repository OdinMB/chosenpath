import { useState, useEffect } from "react";
import { PrimaryButton, Icons, Tabs } from "components/ui";
import { AdminLogin } from "./AdminLogin";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { adminApi } from "./adminApi";

type AdminTab = "templates" | "carousel" | "stories" | "users";

export const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setAuthToken(null);
    setIsAuthenticated(false);
  };

  // Check for existing auth token on component mount
  useEffect(() => {
    const savedToken = localStorage.getItem("admin_token");
    if (savedToken) {
      // Validate token with the server
      const validateToken = async (token: string) => {
        try {
          await adminApi.get(`/admin/auth`, token);
          setAuthToken(token);
          setIsAuthenticated(true);
        } catch {
          handleLogout();
        }
      };

      validateToken(savedToken);
    }
  }, []);

  const handleLogin = (token: string) => {
    localStorage.setItem("admin_token", token);
    setAuthToken(token);
    setIsAuthenticated(true);
  };

  const tabItems = [
    { id: "templates" as AdminTab, label: "Templates" },
    { id: "carousel" as AdminTab, label: "Template Carousel" },
    { id: "stories" as AdminTab, label: "Stories" },
    { id: "users" as AdminTab, label: "Users" },
  ];

  const getActiveTab = (): AdminTab => {
    const path = location.pathname.split("/").pop() || "templates";
    return path as AdminTab;
  };

  const handleTabChange = (tab: AdminTab) => {
    navigate(`/admin/${tab}`);
  };

  const renderAdminDashboard = () => {
    if (!authToken) return null;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="max-w-6xl mx-auto flex items-center justify-between">
              <div className="w-24"></div> {/* Left spacer */}
              <h1 className="text-2xl font-bold text-secondary">Admin</h1>
              <div className="w-24 flex justify-end">
                <PrimaryButton
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  leftIcon={<Icons.LogOut className="h-4 w-4" />}
                >
                  Logout
                </PrimaryButton>
              </div>
            </div>
          </div>
        </header>

        <div className="container mx-auto px-6 py-6">
          <div className="max-w-6xl mx-auto">
            {/* Tabs */}
            <div className="mb-6">
              <Tabs
                items={tabItems}
                activeTab={getActiveTab()}
                onTabChange={handleTabChange}
                variant="underline"
              />
            </div>

            {/* Content based on active route */}
            <Outlet context={{ token: authToken }} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {isAuthenticated && authToken ? (
        renderAdminDashboard()
      ) : (
        <AdminLogin onLogin={handleLogin} />
      )}
    </div>
  );
};

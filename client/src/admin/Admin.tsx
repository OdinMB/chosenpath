import { useState, useEffect, useCallback } from "react";
import { AdminLogin } from "./components/AdminLogin";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { Icons } from "@components/ui/Icons";
import { StoriesOverview } from "./components/StoriesOverview";
import { StoryLibrary } from "./components/StoryLibrary";
import { TemplateForm } from "./components/template/index";
import { StoryTemplate } from "@core/types/story";
import { createDefaultTemplate } from "./components/template/templateFactory";
import { config } from "@/config";

type AdminTab = "stories" | "library" | "template-form";

export const Admin = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("stories");
  const [selectedTemplate, setSelectedTemplate] =
    useState<StoryTemplate | null>(null);
  const [isFormLoading, setIsFormLoading] = useState(false);

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

  const handleCreateTemplate = () => {
    setSelectedTemplate(null);
    setActiveTab("template-form");
  };

  const handleEditTemplate = (template: StoryTemplate) => {
    setSelectedTemplate(template);
    setActiveTab("template-form");
  };

  const handleTemplateFormSaved = (updatedTemplate: StoryTemplate) => {
    if (updatedTemplate.id) {
      // Update the selected template with the latest data and stay in edit view
      setSelectedTemplate(updatedTemplate);
    } else {
      // New template was created, go back to library
      setActiveTab("library");
    }
  };

  const renderAdminDashboard = () => {
    if (!authToken) return null;

    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 shadow-sm">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-secondary">
              Admin Dashboard
            </h1>
            <PrimaryButton
              onClick={handleLogout}
              variant="outline"
              size="sm"
              leftIcon={<Icons.LogOut className="h-4 w-4" />}
            >
              Logout
            </PrimaryButton>
          </div>
        </header>

        <div className="container mx-auto p-6">
          {/* Tabs */}
          <div className="flex border-b mb-6">
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === "stories"
                  ? "text-secondary border-b-2 border-secondary"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("stories")}
            >
              Active Stories
            </button>
            <button
              className={`px-4 py-2 font-medium ${
                activeTab === "library" || activeTab === "template-form"
                  ? "text-secondary border-b-2 border-secondary"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              onClick={() => setActiveTab("library")}
            >
              Story Library
            </button>
          </div>

          {/* Content based on active tab */}
          {activeTab === "stories" && <StoriesOverview token={authToken} />}

          {activeTab === "library" && (
            <StoryLibrary
              token={authToken}
              onCreateNew={handleCreateTemplate}
              onEdit={handleEditTemplate}
            />
          )}

          {activeTab === "template-form" && (
            <div>
              <div className="flex items-center pb-2">
                <h2 className="text-xl font-semibold text-gray-800 truncate">
                  {selectedTemplate?.title
                    ? `${selectedTemplate.title}`
                    : "New Template"}
                </h2>
              </div>
              <TemplateForm
                template={selectedTemplate || createDefaultTemplate()}
                onSubmit={handleTemplateFormSaved}
                isLoading={isFormLoading}
                token={authToken}
                setIsLoading={setIsFormLoading}
              />
            </div>
          )}
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

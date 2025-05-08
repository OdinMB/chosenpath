import { useState, useEffect, useCallback } from "react";
import { PrimaryButton, Icons, Tabs, useTabs } from "components/ui";
import { StoriesOverview } from "./StoriesOverview";
import { AdminLogin } from "./AdminLogin";
import { TemplateLibrary } from "./template/TemplateLibrary.js";
import { TemplateForm } from "./template/components";
import { TemplateCarouselManager } from "./template/TemplateCarouselManager.js";
import { UsersOverview } from "./UsersOverview";
import { StoryTemplate } from "core/types";
import { createDefaultTemplate } from "./template/utils/templateFactory.js";
import { Logger } from "shared/logger";
import { adminApi } from "shared/apiClient";
import { CreateTemplateRequest } from "core/types/admin";

type AdminTab =
  | "templates"
  | "carousel"
  | "stories"
  | "users"
  | "template-form"
  | "sample-template";

export const Admin = () => {
  const { activeTab, setActiveTab } = useTabs<AdminTab>("templates");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(null);
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
          await adminApi.get(`/admin/auth`, token);
          setAuthToken(token);
          setIsAuthenticated(true);
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

  const handleCreateTemplate = async () => {
    if (!authToken) return;

    Logger.Admin.log("Creating new template");
    setIsFormLoading(true);

    try {
      // Create a default template
      const defaultTemplate = createDefaultTemplate();

      // Create a new template record on the server first to get an ID
      const createRequest: CreateTemplateRequest = {
        template: defaultTemplate,
      };

      const response = await adminApi.post<CreateTemplateRequest>(
        `/admin/templates`,
        createRequest,
        authToken
      );

      Logger.Admin.log(
        "New template created with ID:",
        response.data.template.id
      );

      // Set the new template with its ID as the selected template
      setSelectedTemplate(response.data.template);
      setActiveTab("template-form");
    } catch (error) {
      Logger.Admin.error("Error creating new template:", error);
    } finally {
      setIsFormLoading(false);
    }
  };

  const handleEditTemplate = (template: StoryTemplate) => {
    setSelectedTemplate(template);
    setActiveTab("template-form");
  };

  const handleTemplateFormSaved = (updatedTemplate: StoryTemplate) => {
    // Update the selected template with the latest data and stay in edit view
    setSelectedTemplate(updatedTemplate);
  };

  const tabItems = [
    { id: "templates" as AdminTab, label: "Templates" },
    { id: "carousel" as AdminTab, label: "Template Carousel" },
    { id: "stories" as AdminTab, label: "Stories" },
    { id: "users" as AdminTab, label: "Users" },
  ];

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
                activeTab={activeTab}
                onTabChange={setActiveTab}
                variant="underline"
              />
            </div>

            {/* Content based on active tab */}
            {activeTab === "templates" && (
              <TemplateLibrary
                token={authToken}
                onCreateNew={handleCreateTemplate}
                onEdit={handleEditTemplate}
              />
            )}

            {activeTab === "carousel" && (
              <TemplateCarouselManager token={authToken} />
            )}

            {activeTab === "stories" && <StoriesOverview token={authToken} />}

            {activeTab === "users" && <UsersOverview token={authToken} />}

            {activeTab === "template-form" && (
              <div>
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

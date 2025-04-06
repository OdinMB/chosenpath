import { useState } from "react";
import { PrimaryButton } from "../../components/ui/PrimaryButton.js";
import { Icons } from "../../components/ui/Icons.js";
import { StoriesOverview } from "./StoriesOverview.js";
import { StoryLibrary } from "./StoryLibrary.js";
import { StoryTemplateForm } from "./StoryTemplateForm.js";
import { StoryTemplate } from "shared/types/library";

type AdminDashboardProps = {
  onLogout: () => void;
  token: string;
};

type AdminTab = "stories" | "library" | "template-form";

export const AdminDashboard = ({ onLogout, token }: AdminDashboardProps) => {
  const [activeTab, setActiveTab] = useState<AdminTab>("stories");
  const [selectedTemplate, setSelectedTemplate] =
    useState<StoryTemplate | null>(null);

  const handleCreateTemplate = () => {
    setSelectedTemplate(null);
    setActiveTab("template-form");
  };

  const handleEditTemplate = (template: StoryTemplate) => {
    setSelectedTemplate(template);
    setActiveTab("template-form");
  };

  const handleTemplateFormCancel = () => {
    setActiveTab("library");
  };

  const handleTemplateFormSaved = (updatedTemplate?: StoryTemplate) => {
    if (updatedTemplate) {
      // Update the selected template with the latest data and stay in edit view
      setSelectedTemplate(updatedTemplate);
    } else {
      // New template was created, go back to library
      setActiveTab("library");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary">
            Story Management
          </h1>
          <PrimaryButton
            onClick={onLogout}
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
        {activeTab === "stories" && <StoriesOverview token={token} />}

        {activeTab === "library" && (
          <StoryLibrary
            token={token}
            onCreateNew={handleCreateTemplate}
            onEdit={handleEditTemplate}
          />
        )}

        {activeTab === "template-form" && (
          <StoryTemplateForm
            token={token}
            onCancel={handleTemplateFormCancel}
            onSaved={handleTemplateFormSaved}
            existingTemplate={
              selectedTemplate
                ? {
                    id: selectedTemplate.id,
                    title: selectedTemplate.title,
                    gameMode: selectedTemplate.gameMode,
                    playerCount: selectedTemplate.playerCount,
                    setup: selectedTemplate.setup,
                    createdAt: selectedTemplate.createdAt,
                    updatedAt: selectedTemplate.updatedAt,
                  }
                : undefined
            }
          />
        )}
      </div>
    </div>
  );
};

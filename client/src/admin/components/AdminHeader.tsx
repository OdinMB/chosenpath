import { PrimaryButton, Icons, Tabs } from "components/ui";
import { useNavigate, useLocation } from "react-router-dom";

type AdminTab = "templates" | "carousel" | "stories" | "users";

export const AdminHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-24"></div> {/* Left spacer */}
          <h1 className="text-2xl font-bold text-secondary">Admin</h1>
          <div className="w-24 flex justify-end">
            <PrimaryButton
              onClick={onLogout}
              variant="outline"
              size="sm"
              leftIcon={<Icons.LogOut className="h-4 w-4" />}
            >
              Logout
            </PrimaryButton>
          </div>
        </div>
      </div>
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <Tabs
            items={tabItems}
            activeTab={getActiveTab()}
            onTabChange={handleTabChange}
            variant="underline"
          />
        </div>
      </div>
    </header>
  );
};

import { Tabs } from "components/ui";
import { useNavigate, useLocation } from "react-router-dom";

type AdminTab = "templates" | "carousel" | "stories" | "users" | "feedback";

export const AdminHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabItems = [
    { id: "templates" as AdminTab, label: "Worlds" },
    { id: "carousel" as AdminTab, label: "Carousel" },
    { id: "stories" as AdminTab, label: "Stories" },
    { id: "users" as AdminTab, label: "Users" },
    { id: "feedback" as AdminTab, label: "Feedback" },
  ];

  const getActiveTab = (): AdminTab => {
    const segments = location.pathname.split("/").filter(Boolean);
    const adminIndex = segments.indexOf("admin");
    const section =
      adminIndex >= 0 && segments.length > adminIndex + 1
        ? (segments[adminIndex + 1] as AdminTab)
        : ("templates" as AdminTab);

    // Ensure nested routes under templates still show Templates as active
    if (section === "templates") return "templates";
    if (section === "carousel") return "carousel";
    if (section === "stories") return "stories";
    if (section === "users") return "users";
    if (section === "feedback") return "feedback";
    return "templates";
  };

  const handleTabChange = (tab: AdminTab) => {
    navigate(`/admin/${tab}`);
  };

  return (
    <header className="">
      <div className="container mx-auto px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-24"></div> {/* Left spacer */}
          <div className="w-24 flex justify-end"></div>
        </div>
      </div>
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <Tabs
            items={tabItems}
            activeTab={getActiveTab()}
            onTabChange={handleTabChange}
            variant="underline"
            collapseToSelectOnMobile={true}
          />
        </div>
      </div>
    </header>
  );
};

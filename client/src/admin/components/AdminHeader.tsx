import { Tabs } from "components/ui";
import { useNavigate, useLocation } from "react-router-dom";

type AdminTab =
  | "templates"
  | "carousel"
  | "stories"
  | "users"
  | "feedback"
  | "system";

const TAB_ITEMS: { id: AdminTab; label: string }[] = [
  { id: "templates", label: "Worlds" },
  { id: "carousel", label: "Carousel" },
  { id: "stories", label: "Stories" },
  { id: "users", label: "Users" },
  { id: "feedback", label: "Feedback" },
  { id: "system", label: "System" },
];

export const AdminHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // The section after /admin/; nested routes (templates/:id) keep their tab
  const getActiveTab = (): AdminTab => {
    const segments = location.pathname.split("/").filter(Boolean);
    const adminIndex = segments.indexOf("admin");
    const section = adminIndex >= 0 ? segments[adminIndex + 1] : undefined;
    return TAB_ITEMS.find((item) => item.id === section)?.id ?? "templates";
  };

  const handleTabChange = (tab: AdminTab) => {
    navigate(`/admin/${tab}`);
  };

  return (
    <header className="">
      <Tabs
        items={TAB_ITEMS}
        activeTab={getActiveTab()}
        onTabChange={handleTabChange}
        variant="submenu"
      />
    </header>
  );
};

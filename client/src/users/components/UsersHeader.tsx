import React from "react";
import { Tabs } from "components/ui";
import { useNavigate, useLocation } from "react-router-dom";

type UserTab = "my-stories" | "my-worlds";

export const UsersHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabItems = [
    { id: "my-stories" as UserTab, label: "My Stories" },
    { id: "my-worlds" as UserTab, label: "My Worlds" },
  ];

  const getActiveTab = (): UserTab => {
    const pathSegments = location.pathname.split("/");
    const lastSegment = pathSegments[pathSegments.length - 1];

    // Handle nested routes like /users/my-stories or /users/my-worlds
    if (lastSegment === "my-stories" || pathSegments.includes("my-stories")) {
      return "my-stories";
    }
    if (lastSegment === "my-worlds" || pathSegments.includes("my-worlds")) {
      return "my-worlds";
    }

    // Default to my-stories
    return "my-stories";
  };

  const handleTabChange = (tab: UserTab) => {
    navigate(`/users/${tab}`);
  };

  return (
    <header className="">
      <div className="container mx-auto px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="w-24"></div> {/* Left spacer */}
          <h1 className="text-2xl font-bold text-secondary">Account</h1>
          <div className="w-24 flex justify-end">{/* Right spacer */}</div>
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

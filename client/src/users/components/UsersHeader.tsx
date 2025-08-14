import React from "react";
import { Tabs } from "components/ui";
import { useNavigate, useLocation } from "react-router-dom";

type UserTab = "my-stories" | "archive" | "my-worlds";

export const UsersHeader: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const tabItems = [
    { id: "my-stories" as UserTab, label: "My Stories" },
    { id: "archive" as UserTab, label: "Archive" },
    { id: "my-worlds" as UserTab, label: "My Worlds" },
  ];

  const getActiveTab = (): UserTab => {
    const pathSegments = location.pathname.split("/");
    const lastSegment = pathSegments[pathSegments.length - 1];

    // Handle nested routes like /users/my-stories, /users/archive, or /users/my-worlds
    if (lastSegment === "my-stories" || pathSegments.includes("my-stories")) {
      return "my-stories";
    }
    if (lastSegment === "archive" || pathSegments.includes("archive")) {
      return "archive";
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
      <Tabs
        items={tabItems}
        activeTab={getActiveTab()}
        onTabChange={handleTabChange}
        variant="submenu"
      />
    </header>
  );
};

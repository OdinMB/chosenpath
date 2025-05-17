import React from "react";
import { useNavigate } from "react-router-dom";
import { Logger } from "shared/logger";
import { ResumableStories } from "shared/components/ResumableStories";

export const Users: React.FC = () => {
  const navigate = useNavigate();

  const handleCodeSelect = (code: string) => {
    Logger.App.log("Users: Story code selected:", code);
    const tabId =
      sessionStorage.getItem("tabId") ||
      Math.random().toString(36).substring(2, 15);
    localStorage.setItem(`playerCode_${tabId}`, code);
    navigate(`/game/${code}`);
  };

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-semibold mb-6 text-gray-800">My Stories</h2>
      <ResumableStories onCodeSelect={handleCodeSelect} />
    </div>
  );
};

import React from "react";
import { ResumableStories } from "client/resources/stories/ResumableStories";

export const UsersArchive: React.FC = () => {
  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6 text-gray-800">
        Archived Stories
      </h2>
      <ResumableStories showArchivedOnly={true} />
    </div>
  );
};

import React from "react";
import { useNavigate } from "react-router-dom";
import { ResumableStories } from "client/resources/stories/ResumableStories";

export const UsersStories: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <h2 className="text-2xl font-semibold text-gray-800">My Stories</h2>
        <a
          href="/users/seat-cards"
          onClick={(e) => {
            e.preventDefault();
            navigate("/users/seat-cards");
          }}
          className="text-sm text-link focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
        >
          Print seat cards
        </a>
      </div>
      <ResumableStories />
    </div>
  );
};

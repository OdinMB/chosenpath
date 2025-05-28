import React from "react";
import { Outlet } from "react-router-dom";
import { UsersHeader } from "./UsersHeader";
import { UserAccountHeader } from "./UserAccountHeader";

export const UsersLayout: React.FC = () => {
  return (
    <div className="min-h-screen">
      <UserAccountHeader />
      <UsersHeader />
      <div className="container mx-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {/* @ts-expect-error Outlet type issue with React 18, but functionality is correct */}
          <Outlet />
        </div>
      </div>
    </div>
  );
};

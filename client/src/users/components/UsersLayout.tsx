import React from "react";
import { Outlet } from "react-router-dom";
import { UsersHeader } from "./UsersHeader";
import { UserAccountHeader } from "./UserAccountHeader";

export const UsersLayout: React.FC = () => {
  return (
    <div className="users-layout">
      <UserAccountHeader />
      <UsersHeader />
      <main className="users-content">
        {/* @ts-expect-error Outlet type issue with React 18, but functionality is correct */}
        <Outlet />
      </main>
    </div>
  );
};

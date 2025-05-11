import { Outlet } from "react-router-dom";
import { AdminHeader } from "./AdminHeader";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="container mx-auto px-6 py-6">
        <div className="max-w-6xl mx-auto">
          {/* @ts-expect-error - React Router's Outlet type definition issue */}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

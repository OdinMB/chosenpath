import { useNavigate, Outlet } from "react-router-dom";
import { PageHeader } from "./components/PageHeader";
import { UserAccountHeader } from "users/components/UserAccountHeader";

export function PageLayout() {
  const navigate = useNavigate();

  return (
    <>
      <UserAccountHeader />
      <PageHeader onTitleClick={() => navigate("/")} />
      {/* @ts-expect-error - React Router's Outlet type definition issue */}
      <Outlet />
    </>
  );
}

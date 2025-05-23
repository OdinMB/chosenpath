import { useNavigate, Outlet } from "react-router-dom";
import { PageHeader } from "./components/PageHeader";
import { UserAccountHeader } from "users/components/UserAccountHeader";

export function PageLayout() {
  const navigate = useNavigate();

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-10 w-full bg-white">
        <UserAccountHeader />
      </div>
      <div className="pt-[48px]">
        <PageHeader onTitleClick={() => navigate("/")} />
        {/* @ts-expect-error - React Router's Outlet type definition issue */}
        <Outlet />
      </div>
    </>
  );
}

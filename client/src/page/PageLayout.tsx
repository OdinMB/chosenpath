import { useNavigate, Outlet } from "react-router-dom";
import { PageHeader } from "./components/PageHeader";

export function PageLayout() {
  const navigate = useNavigate();

  return (
    <>
      <PageHeader onTitleClick={() => navigate("/")} />
      {/* @ts-expect-error - React Router's Outlet type definition issue */}
      <Outlet />
    </>
  );
}

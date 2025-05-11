import { useNavigate, Outlet } from "react-router-dom";
import { Header } from "../shared/components/Header";

export function PageLayout() {
  const navigate = useNavigate();

  return (
    <>
      <Header size="large" onTitleClick={() => navigate("/")} />
      {/* @ts-expect-error - React Router's Outlet type definition issue */}
      <Outlet />
    </>
  );
}

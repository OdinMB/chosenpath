import React from "react";
import { useNavigation, useNavigate } from "react-router-dom";
import { LoadingSpinner } from "./LoadingSpinner";
import { Header } from "./Header";

interface RouteWrapperProps {
  children: React.ReactNode;
}

export function RouteWrapper({ children }: RouteWrapperProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";
  const navigate = useNavigate();

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-80 z-50 flex items-center justify-center">
          <LoadingSpinner size="large" />
        </div>
      )}
      <Header size="large" onTitleClick={() => navigate("/")} />
      {children}
    </>
  );
}

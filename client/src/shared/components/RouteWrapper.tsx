import React from "react";
import { useNavigation } from "react-router-dom";
import { LoadingSpinner } from "./LoadingSpinner";

interface RouteWrapperProps {
  children: React.ReactNode;
}

export function RouteWrapper({ children }: RouteWrapperProps) {
  const navigation = useNavigation();
  const isLoading = navigation.state === "loading";

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-80 z-50 flex items-center justify-center">
          <LoadingSpinner size="large" />
        </div>
      )}
      {children}
    </>
  );
}

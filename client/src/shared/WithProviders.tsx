import { ReactNode } from "react";
import { SessionProvider } from "./SessionProvider";
import { AuthProvider } from "./AuthContext";
import { RouteWrapper } from "./components/RouteWrapper";

// Auth and session wrapper component
export const WithProviders = ({ children }: { children: ReactNode }) => (
  <SessionProvider>
    <AuthProvider>
      <RouteWrapper>{children}</RouteWrapper>
    </AuthProvider>
  </SessionProvider>
);

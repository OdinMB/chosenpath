import { ReactNode } from "react";
import { SessionProvider } from "./SessionProvider";
import { AuthProvider } from "./AuthContext";

// Auth and session wrapper component
export const WithProviders = ({ children }: { children: ReactNode }) => (
  <SessionProvider>
    <AuthProvider>{children}</AuthProvider>
  </SessionProvider>
);

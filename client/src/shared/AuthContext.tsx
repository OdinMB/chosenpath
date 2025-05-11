import { useState, useEffect, ReactNode } from "react";
import { PublicUser } from "core/types/user.js";
import { AuthContext } from "./AuthContextDefinition";
import { authApi } from "./authApi";

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  console.log("AuthProvider: Initializing");

  // Check if user is already logged in on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Function to check current auth status
  const checkAuthStatus = async () => {
    console.log("AuthProvider: Checking auth status");
    setIsLoading(true);
    try {
      const response = await authApi.getCurrentUser();
      if (response) {
        console.log(
          "AuthProvider: Successfully authenticated user",
          response.username
        );
        setUser(response);
      } else {
        console.log("AuthProvider: No authenticated user");
        setUser(null);
      }
    } catch (error) {
      console.error("AuthProvider: Authentication check failed", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (
    email: string,
    password: string,
    rememberMe = false
  ): Promise<void> => {
    console.log("AuthProvider: Login initiated", { email, rememberMe });
    setIsLoading(true);
    try {
      const { user: userData } = await authApi.login({
        email,
        password,
        rememberMe,
      });

      // Update user state
      setUser(userData);
      console.log("AuthProvider: User state updated", userData.username);
    } catch (error) {
      console.error("AuthProvider: Login failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    console.log("AuthProvider: Logout initiated");
    setIsLoading(true);
    try {
      await authApi.logout();
      console.log("AuthProvider: Logout API call successful");
    } catch (error) {
      console.error("AuthProvider: Logout API call failed", error);
    } finally {
      // Always clean up local state even if API call fails
      setUser(null);
      console.log("AuthProvider: User state cleared");
      setIsLoading(false);
      window.location.href = "/"; // full page reload
    }
  };

  // Register function
  const register = async (
    email: string,
    username: string,
    password: string
  ): Promise<void> => {
    console.log("AuthProvider: Registration initiated", { email, username });
    setIsLoading(true);
    try {
      await authApi.register({
        email,
        username,
        password,
      });

      console.log("AuthProvider: Registration successful");
    } catch (error) {
      console.error("AuthProvider: Registration failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    register,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

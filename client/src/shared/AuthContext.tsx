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
    const token = localStorage.getItem("authToken");
    if (token) {
      console.log(
        "AuthProvider: Found token in localStorage, checking auth status"
      );
      checkAuthStatus();
    } else {
      console.log("AuthProvider: No token found in localStorage");
      setIsLoading(false);
    }
  }, []);

  // Function to check current auth status
  const checkAuthStatus = async () => {
    console.log("AuthProvider: Checking auth status");
    setIsLoading(true);
    try {
      const userData = await authApi.getCurrentUser();
      console.log(
        "AuthProvider: Successfully authenticated user",
        userData.username
      );
      setUser(userData);
    } catch (error) {
      console.error("AuthProvider: Authentication check failed", error);
      // Clear invalid token
      localStorage.removeItem("authToken");
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
      const { token, user: userData } = await authApi.login({
        email,
        password,
        rememberMe,
      });

      // Store token
      localStorage.setItem("authToken", token);
      console.log("AuthProvider: Token stored in localStorage");

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
      localStorage.removeItem("authToken");
      console.log("AuthProvider: Token removed from localStorage");
      setUser(null);
      console.log("AuthProvider: User state cleared");
      setIsLoading(false);
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

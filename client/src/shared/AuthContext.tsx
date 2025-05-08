import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { PublicUser } from "core/types/user.js";
import { apiClient } from "./apiClient";

interface AuthContextType {
  user: PublicUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    email: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<void>;
  logout: () => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

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
      const response = await apiClient.get("/auth/me");
      console.log("AuthProvider: Auth check response", response.data);
      if (response.data?.user) {
        console.log(
          "AuthProvider: Successfully authenticated user",
          response.data.user.username
        );
        setUser(response.data.user);
      }
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
  const login = async (email: string, password: string, rememberMe = false) => {
    console.log("AuthProvider: Login initiated", { email, rememberMe });
    setIsLoading(true);
    try {
      const response = await apiClient.post("/auth/login", {
        email,
        password,
        rememberMe,
      });

      console.log("AuthProvider: Login response received", response.data);
      const { token, user: userData } = response.data;

      // Store token
      localStorage.setItem("authToken", token);
      console.log("AuthProvider: Token stored in localStorage");

      // Update user state
      setUser(userData);
      console.log("AuthProvider: User state updated", userData.username);
      return userData;
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
      await apiClient.post("/auth/logout");
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
  ) => {
    console.log("AuthProvider: Registration initiated", { email, username });
    setIsLoading(true);
    try {
      const response = await apiClient.post("/auth/register", {
        email,
        username,
        password,
      });

      console.log("AuthProvider: Registration successful", response.data);
      // Registration successful, but user still needs to login
      return response.data.user;
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

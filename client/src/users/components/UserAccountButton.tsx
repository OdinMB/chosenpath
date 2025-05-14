import { useState, useRef, useEffect } from "react";
import { useAuth } from "shared/useAuth";
import { useUserAccountModal } from "../hooks";
import { PrimaryButton } from "shared/components/ui";
import { useNavigate } from "react-router-dom";
import { isDevelopment } from "client/config";

export function UserAccountButton() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { openLoginModal, AccountModal } = useUserAccountModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    console.log("UserAccountButton: Logout initiated");
    await logout();
    setDropdownOpen(false);
    console.log("UserAccountButton: Logout completed");
  };

  const handleStoriesClick = () => {
    console.log("UserAccountButton: Stories link clicked");
    try {
      setDropdownOpen(false);
      console.log("UserAccountButton: About to navigate to /users/my-stories");
      navigate("/users/my-stories");
      console.log("UserAccountButton: Navigation function called");
    } catch (error) {
      console.error(
        "UserAccountButton: Error navigating to stories page",
        error
      );
    }
  };

  const handleAdminClick = () => {
    console.log("UserAccountButton: Admin Dashboard link clicked");
    try {
      setDropdownOpen(false);
      navigate("/admin");
      console.log("UserAccountButton: Navigation to admin dashboard initiated");
    } catch (error) {
      console.error(
        "UserAccountButton: Error navigating to admin dashboard",
        error
      );
    }
  };

  // If not in development mode, don't render the button
  if (!isDevelopment) {
    return null;
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {isAuthenticated ? (
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-primary-50 transition text-primary-700"
          >
            <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-medium">
              {user?.username.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs font-medium">{user?.username}</span>
          </button>
        ) : (
          <PrimaryButton
            onClick={openLoginModal}
            size="sm"
            variant="outline"
            isLoading={isLoading}
            className="text-xs"
          >
            Sign In
          </PrimaryButton>
        )}

        {/* Dropdown menu */}
        {dropdownOpen && isAuthenticated && (
          <div className="absolute right-0 mt-1 w-40 bg-white rounded shadow-md py-1 z-10 text-sm border border-primary-100">
            <div className="px-3 py-1 border-b border-primary-50">
              <p className="text-xs font-medium">{user?.username}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
            {user?.roleId === "role_admin" && (
              <button
                onClick={handleAdminClick}
                className="block w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Admin Dashboard
              </button>
            )}
            <button
              onClick={handleStoriesClick}
              className="block w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              My Stories
            </button>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>

      <AccountModal />
    </>
  );
}

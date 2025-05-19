import { useAuth } from "shared/useAuth";
import { useUserAccountModal } from "../hooks/useUserAccountModal.js";
import { useNavigate } from "react-router-dom";
import { Icons } from "../../shared/components/ui/Icons";
import { useEffect, useState } from "react";
import { usersApi } from "../usersApi";
import { UserStoryCounts } from "core/types/api";

export function UserAccountHeader() {
  const { user, isAuthenticated, logout, isLoading: authIsLoading } = useAuth(); // Renamed isLoading to authIsLoading to avoid conflict
  const { openLoginModal, AccountModal } = useUserAccountModal();
  const navigate = useNavigate();

  const [storyCounts, setStoryCounts] = useState<UserStoryCounts | null>(null);
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);

  useEffect(() => {
    if (isAuthenticated && user) {
      setIsLoadingCounts(true);
      usersApi
        .getUserStoryCounts()
        .then((counts) => {
          setStoryCounts(counts);
        })
        .catch((error) => {
          console.error("Failed to fetch story counts:", error);
          setStoryCounts(null); // Clear counts on error
        })
        .finally(() => {
          setIsLoadingCounts(false);
        });
    } else {
      setStoryCounts(null); // Clear counts if not authenticated
    }
  }, [isAuthenticated, user]);

  const handleLogout = async () => {
    await logout();
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  // Basic badge component for pending count
  const NotificationBadge: React.FC<{ count: number }> = ({ count }) => (
    <span className="ml-1 bg-red-500 text-white text-xs font-semibold px-1.5 py-0.5 rounded-md flex items-center justify-center min-w-[18px] h-4">
      {count}
    </span>
  );

  return (
    <>
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-1 text-sm mb-2">
        <div className="container mx-auto flex flex-wrap justify-end md:justify-center items-center space-x-3 md:space-x-4 h-auto md:h-8 min-h-[32px]">
          {isAuthenticated ? (
            <>
              <button
                onClick={() => handleNavigate("/")}
                className="text-slate-700 hover:text-primary-600 py-1 flex items-center"
                aria-label="Home"
              >
                Home
              </button>

              {user?.roleId === "role_admin" && (
                <button
                  onClick={() => handleNavigate("/admin")}
                  className="text-slate-700 hover:text-primary-600 hover:underline py-1"
                >
                  Admin
                </button>
              )}
              <button
                onClick={() => handleNavigate("/users/my-stories")}
                className="text-slate-700 hover:text-primary-600 hover:underline py-1"
              >
                My Stories
              </button>
              {/* Story Counts Display */}
              {!isLoadingCounts && storyCounts && (
                <div className="flex items-center text-slate-700">
                  {/* Single-player stories */}
                  <div
                    className="flex items-center -ml-1 mr-2 border border-slate-300 rounded-md px-1"
                    title={`${
                      storyCounts.singlePlayerActiveCount
                    } single-player ${
                      storyCounts.singlePlayerActiveCount === 1
                        ? "story"
                        : "stories"
                    }`}
                  >
                    <Icons.User className="h-4 w-4 mr-0.5 p-[1px]" />
                    <span>{storyCounts.singlePlayerActiveCount}</span>
                  </div>

                  {/* Multi-player stories */}
                  <div
                    className="flex items-center border border-slate-300 rounded-md px-1 -ml-1"
                    title={`${
                      storyCounts.multiPlayerActiveCount
                    } multi-player ${
                      storyCounts.multiPlayerActiveCount === 1
                        ? "story"
                        : "stories"
                    }${
                      storyCounts.multiPlayerPendingCount > 0
                        ? `, ${storyCounts.multiPlayerPendingCount} pending your action`
                        : ""
                    }`}
                  >
                    <Icons.Users className="h-4 w-4" />
                    {storyCounts.multiPlayerPendingCount > 0 && (
                      <NotificationBadge
                        count={storyCounts.multiPlayerPendingCount}
                      />
                    )}
                    {storyCounts.multiPlayerPendingCount > 0 && (
                      <span className="mx-0.5">/</span>
                    )}
                    <span
                      className={`${
                        storyCounts.multiPlayerPendingCount > 0
                          ? "ml-0"
                          : "ml-1"
                      }`}
                    >
                      {storyCounts.multiPlayerActiveCount}
                    </span>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="text-slate-700 hover:text-primary-600 py-1 flex items-center ml-2"
                aria-label="Sign Out"
              >
                <Icons.LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              onClick={openLoginModal}
              disabled={authIsLoading}
              className="text-primary-600 hover:underline text-sm py-1 flex items-center space-x-1"
            >
              <Icons.User className="h-4 w-4" />
              <span>{authIsLoading ? "Loading..." : "Sign In"}</span>
            </button>
          )}
        </div>
      </div>
      <AccountModal />{" "}
      {/* Renders the modal structure, necessary for openLoginModal */}
    </>
  );
}

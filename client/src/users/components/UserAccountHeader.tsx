import { useAuth } from "client/shared/auth/useAuth.js";
import { useUserAccountModal } from "../hooks/useUserAccountModal.js";
import { useNavigate } from "react-router-dom";
import { Icons } from "../../shared/components/ui/Icons";
import { useMemo } from "react";
import { useSession } from "client/shared/session/useSession.js";
import { ExtendedStoryMetadata } from "core/types/api";

export function UserAccountHeader() {
  const { user, isAuthenticated, logout, isLoading: authIsLoading } = useAuth();
  const { openLoginModal, AccountModal } = useUserAccountModal();
  const navigate = useNavigate();
  const { storyFeed, isLoading: isSessionLoading } = useSession();

  const derivedCounts = useMemo(() => {
    const counts = {
      singlePlayerActiveCount: 0,
      multiPlayerActiveCount: 0,
      multiPlayerPendingCount: 0,
    };

    if (!isAuthenticated || !user || Object.keys(storyFeed).length === 0) {
      return counts;
    }

    Object.values(storyFeed).forEach((story: ExtendedStoryMetadata) => {
      if (story.players.length === 1) {
        counts.singlePlayerActiveCount++;
      } else {
        counts.multiPlayerActiveCount++;

        const playerEntryForCurrentUser = story.players.find(
          (p) => p.isCurrentUser
        );
        if (playerEntryForCurrentUser && playerEntryForCurrentUser.isPending) {
          counts.multiPlayerPendingCount++;
        }
      }
    });

    return counts;
  }, [storyFeed, user, isAuthenticated]);

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
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-1 text-sm">
        <div className="container mx-auto flex flex-wrap justify-end md:justify-center items-center space-x-5 md:space-x-5 h-auto md:h-8 min-h-[32px]">
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
              {!isSessionLoading && derivedCounts && (
                <div className="flex items-center text-slate-700">
                  {/* Single-player stories */}
                  <div
                    className="flex items-center -ml-1 mr-2 border border-slate-300 rounded-md px-1"
                    title={`${
                      derivedCounts.singlePlayerActiveCount
                    } single-player ${
                      derivedCounts.singlePlayerActiveCount === 1
                        ? "story"
                        : "stories"
                    }`}
                  >
                    <Icons.User className="h-4 w-4 mr-0.5 p-[1px]" />
                    <span>{derivedCounts.singlePlayerActiveCount}</span>
                  </div>

                  {/* Multi-player stories */}
                  <div
                    className="flex items-center border border-slate-300 rounded-md px-1 -ml-1"
                    title={`${
                      derivedCounts.multiPlayerActiveCount
                    } multi-player ${
                      derivedCounts.multiPlayerActiveCount === 1
                        ? "story"
                        : "stories"
                    }${
                      derivedCounts.multiPlayerPendingCount > 0
                        ? `, ${derivedCounts.multiPlayerPendingCount} pending your action`
                        : ""
                    }`}
                  >
                    <Icons.Users className="h-4 w-4" />
                    {derivedCounts.multiPlayerPendingCount > 0 && (
                      <NotificationBadge
                        count={derivedCounts.multiPlayerPendingCount}
                      />
                    )}
                    {derivedCounts.multiPlayerPendingCount > 0 && (
                      <span className="mx-0.5">/</span>
                    )}
                    <span
                      className={`${
                        derivedCounts.multiPlayerPendingCount > 0
                          ? "ml-0"
                          : "ml-1"
                      }`}
                    >
                      {derivedCounts.multiPlayerActiveCount}
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

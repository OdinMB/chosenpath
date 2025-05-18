import { useAuth } from "shared/useAuth";
import { useUserAccountModal } from "../hooks/useUserAccountModal.js";
import { useNavigate } from "react-router-dom";
import { Icons } from "../../shared/components/ui/Icons";

export function UserAccountHeader() {
  const { user, isAuthenticated, logout, isLoading } = useAuth();
  const { openLoginModal, AccountModal } = useUserAccountModal();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
  };

  const handleNavigate = (path: string) => {
    navigate(path);
  };

  return (
    <>
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-1 text-sm">
        <div className="container mx-auto flex flex-wrap justify-end md:justify-center items-center space-x-4 h-auto md:h-8 min-h-[32px]">
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
              <button
                onClick={handleLogout}
                className="text-slate-700 hover:text-primary-600 py-1 flex items-center"
                aria-label="Sign Out"
              >
                <Icons.LogOut className="h-5 w-5" />
              </button>
            </>
          ) : (
            <button
              onClick={openLoginModal}
              disabled={isLoading}
              className="text-primary-600 hover:underline text-sm py-1 flex items-center space-x-1"
            >
              <Icons.User className="h-4 w-4" />
              <span>{isLoading ? "Loading..." : "Sign In"}</span>
            </button>
          )}
        </div>
      </div>
      <AccountModal />{" "}
      {/* Renders the modal structure, necessary for openLoginModal */}
    </>
  );
}

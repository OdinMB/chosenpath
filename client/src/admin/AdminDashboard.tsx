import { PrimaryButton } from "../components/ui/PrimaryButton";
import { Icons } from "../components/ui/Icons";

type AdminDashboardProps = {
  onLogout: () => void;
};

export const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary">Admin Dashboard</h1>
          <PrimaryButton
            onClick={onLogout}
            variant="outline"
            size="sm"
            leftIcon={<Icons.LogOut className="h-4 w-4" />}
          >
            Logout
          </PrimaryButton>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <div className="mb-6 rounded-lg bg-white p-6 shadow-md">
          <div className="mb-4 flex items-center text-accent">
            <Icons.Success className="mr-2 h-5 w-5" />
            <span className="font-medium">
              You're successfully logged in as admin
            </span>
          </div>

          <hr className="my-4 border-t border-gray-200" />

          <div className="rounded-lg bg-gray-50 p-4">
            <h2 className="mb-2 text-lg font-medium text-secondary">
              Story Management
            </h2>
            <p className="text-primary-700">
              Story management features will be implemented here.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg bg-white p-6 shadow-md">
            <h3 className="mb-3 flex items-center text-lg font-medium text-secondary">
              <Icons.Globe className="mr-2 h-5 w-5" />
              Active Stories
            </h3>
            <p className="text-primary-700">
              View and manage currently active stories.
            </p>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-md">
            <h3 className="mb-3 flex items-center text-lg font-medium text-secondary">
              <Icons.Clipboard className="mr-2 h-5 w-5" />
              Story Archives
            </h3>
            <p className="text-primary-700">
              Access archived stories and game history.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

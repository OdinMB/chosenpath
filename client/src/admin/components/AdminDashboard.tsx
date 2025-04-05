import { PrimaryButton } from "../../components/ui/PrimaryButton.js";
import { Icons } from "../../components/ui/Icons.js";
import { StoriesOverview } from "./StoriesOverview.js";

type AdminDashboardProps = {
  onLogout: () => void;
  token: string;
};

export const AdminDashboard = ({ onLogout, token }: AdminDashboardProps) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-secondary">
            Story Management
          </h1>
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
        <StoriesOverview token={token} />
      </div>
    </div>
  );
};

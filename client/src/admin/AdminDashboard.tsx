type AdminDashboardProps = {
  onLogout: () => void;
};

export const AdminDashboard = ({ onLogout }: AdminDashboardProps) => {
  return (
    <div className="container mx-auto p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
        <button
          onClick={onLogout}
          className="rounded bg-gray-200 px-4 py-2 text-sm hover:bg-gray-300"
        >
          Logout
        </button>
      </header>

      <div className="rounded-lg bg-white p-6 shadow-md">
        <div className="mb-4 flex items-center text-green-600">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="mr-2 h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">
            You're successfully logged in as admin
          </span>
        </div>

        <div className="rounded-lg bg-gray-50 p-4">
          <h2 className="mb-2 text-lg font-medium">Story Management</h2>
          <p className="text-gray-600">
            Story management features will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
};

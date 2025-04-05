import { useState } from "react";
import { PrimaryButton } from "../components/ui/PrimaryButton";
import { Icons } from "../components/ui/Icons";

type AdminLoginProps = {
  onLogin: (token: string) => void;
};

export const AdminLogin = ({ onLogin }: AdminLoginProps) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/admin/auth", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${password}`,
        },
      });

      if (response.ok) {
        onLogin(password);
      } else {
        const data = await response.json();
        setError(data.error || "Authentication failed");
      }
    } catch {
      setError("Failed to connect to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-md">
        <div>
          <h2 className="text-center text-3xl font-bold text-secondary">
            Admin Login
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center rounded-md bg-tertiary-100 p-4 text-sm text-tertiary">
              <Icons.Error className="mr-2 h-5 w-5" />
              <span>{error}</span>
            </div>
          )}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-primary-800"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="mt-1 block w-full rounded-md border border-primary-300 px-3 py-2 shadow-sm focus:border-secondary focus:outline-none focus:ring-secondary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <PrimaryButton
              type="submit"
              disabled={isLoading}
              isLoading={isLoading}
              fullWidth
              rightIcon={<Icons.ArrowRight />}
            >
              Login
            </PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
};

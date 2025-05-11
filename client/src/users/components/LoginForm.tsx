import { useState } from "react";
import { useAuth } from "shared/useAuth";
import { PrimaryButton } from "shared/components/ui";

interface LoginFormProps {
  onSuccess?: () => void;
  onRegisterClick?: () => void;
  registrationSuccessMessage?: string;
}

export function LoginForm({
  onSuccess,
  onRegisterClick,
  registrationSuccessMessage,
}: LoginFormProps) {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("LoginForm: Submit initiated");

    if (!email || !password) {
      setError("Please enter both email and password");
      console.log("LoginForm: Validation failed - missing fields");
      return;
    }

    try {
      console.log("LoginForm: Attempting login");
      setError(null);
      await login(email, password, rememberMe);
      console.log("LoginForm: Login successful");
      if (onSuccess) {
        console.log("LoginForm: Triggering onSuccess callback");
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed";
      console.log("LoginForm: Login failed", errorMessage);
      setError("Login failed");
    }
  };

  return (
    <div className="p-4">
      {registrationSuccessMessage && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {registrationSuccessMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="email"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email"
            disabled={isLoading}
            required
          />
        </div>

        <div className="mb-6">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            disabled={isLoading}
            required
          />
        </div>

        <div className="mb-6 flex items-center">
          <input
            id="rememberMe"
            type="checkbox"
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={isLoading}
          />
          <label
            className="ml-2 block text-sm text-gray-700"
            htmlFor="rememberMe"
          >
            Remember me
          </label>
        </div>

        <div className="flex flex-col space-y-3">
          <PrimaryButton
            type="submit"
            disabled={isLoading}
            isLoading={isLoading}
            fullWidth
          >
            Login
          </PrimaryButton>

          <PrimaryButton
            type="button"
            variant="outline"
            onClick={onRegisterClick}
            disabled={isLoading}
            fullWidth
          >
            Create Account
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

import { useState } from "react";
import { useAuth } from "../../shared/AuthContext";
import { PrimaryButton } from "../../shared/components/ui";

interface RegisterFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
}

export function RegisterForm({ onSuccess, onLoginClick }: RegisterFormProps) {
  const { register, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("RegisterForm: Submit initiated");

    // Validate form inputs
    if (!email || !username || !password || !confirmPassword) {
      setError("All fields are required");
      console.log("RegisterForm: Validation failed - missing fields");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      console.log("RegisterForm: Validation failed - invalid email format");
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      console.log("RegisterForm: Validation failed - password too short");
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      console.log("RegisterForm: Validation failed - passwords don't match");
      return;
    }

    try {
      console.log("RegisterForm: Attempting registration");
      setError(null);
      await register(email, username, password);
      console.log("RegisterForm: Registration successful");
      setSuccessMessage("Registration successful! You can now log in.");

      // After a delay, switch to login view
      setTimeout(() => {
        if (onSuccess) {
          console.log("RegisterForm: Triggering onSuccess callback");
          onSuccess();
        }
      }, 2000);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Registration failed";
      console.log("RegisterForm: Registration failed", errorMessage);
      setError(errorMessage);
    }
  };

  return (
    <div className="p-4">
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {successMessage}
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
            disabled={isLoading || !!successMessage}
            required
          />
        </div>

        <div className="mb-4">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="username"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Choose a username"
            disabled={isLoading || !!successMessage}
            required
          />
        </div>

        <div className="mb-4">
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
            placeholder="Create a password (8+ characters)"
            disabled={isLoading || !!successMessage}
            required
          />
        </div>

        <div className="mb-6">
          <label
            className="block text-gray-700 text-sm font-bold mb-2"
            htmlFor="confirmPassword"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            disabled={isLoading || !!successMessage}
            required
          />
        </div>

        <div className="flex flex-col space-y-3">
          <PrimaryButton
            type="submit"
            disabled={isLoading || !!successMessage}
            isLoading={isLoading}
            fullWidth
          >
            Register
          </PrimaryButton>

          <button
            type="button"
            className="text-primary hover:underline focus:outline-none text-center"
            onClick={onLoginClick}
            disabled={isLoading}
          >
            Already have an account?
          </button>
        </div>
      </form>
    </div>
  );
}

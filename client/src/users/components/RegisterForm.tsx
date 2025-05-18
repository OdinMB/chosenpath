import { useState, useEffect } from "react";
import { useAuth } from "shared/useAuth";
import { PrimaryButton } from "shared/components/ui";

interface RegisterFormProps {
  onSuccess?: () => void;
  onLoginClick?: () => void;
  onError?: () => void;
  showSuccessMessage?: boolean;
}

export function RegisterForm({
  onSuccess,
  onLoginClick,
  onError,
  showSuccessMessage = false,
}: RegisterFormProps) {
  const { register, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [subscribeToNewsletter, setSubscribeToNewsletter] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localSuccessMessage, setLocalSuccessMessage] = useState<string | null>(
    null
  );

  // Clear error when component unmounts or when showSuccessMessage changes
  useEffect(() => {
    if (showSuccessMessage) {
      setError(null);
    }
  }, [showSuccessMessage]);

  // Determine whether to show success message from prop or local state
  const successMessage = showSuccessMessage
    ? "Registration successful! You can now log in."
    : localSuccessMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("RegisterForm: Submit initiated");

    // Validate form inputs
    if (!email || !username || !password || !confirmPassword) {
      setError("All fields are required");
      console.log("RegisterForm: Validation failed - missing fields");
      if (onError) {
        console.log(
          "RegisterForm: Triggering onError callback for validation error"
        );
        onError();
      }
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address");
      console.log("RegisterForm: Validation failed - invalid email format");
      if (onError) {
        console.log(
          "RegisterForm: Triggering onError callback for validation error"
        );
        onError();
      }
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      console.log("RegisterForm: Validation failed - password too short");
      if (onError) {
        console.log(
          "RegisterForm: Triggering onError callback for validation error"
        );
        onError();
      }
      return;
    }

    // Validate password match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      console.log("RegisterForm: Validation failed - passwords don't match");
      if (onError) {
        console.log(
          "RegisterForm: Triggering onError callback for validation error"
        );
        onError();
      }
      return;
    }

    try {
      console.log("RegisterForm: Attempting registration");
      setError(null);
      await register(email, username, password, subscribeToNewsletter);
      console.log("RegisterForm: Registration successful");
      setLocalSuccessMessage("Registration successful! You can now log in.");

      if (onSuccess) {
        console.log("RegisterForm: Triggering onSuccess callback");
        onSuccess();
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Registration failed";
      console.log("RegisterForm: Registration failed", errorMessage);
      setError(errorMessage);

      if (onError) {
        console.log(
          "RegisterForm: Triggering onError callback for server error"
        );
        onError();
      }
    }
  };

  // Use combined success message for display
  const displaySuccessMessage = successMessage;

  // Determine if form should be disabled
  const formDisabled = isLoading || !!displaySuccessMessage;

  return (
    <div className="p-4">
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {displaySuccessMessage && (
        <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
          {displaySuccessMessage}
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
            disabled={formDisabled}
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
            disabled={formDisabled}
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
            disabled={formDisabled}
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
            disabled={formDisabled}
            required
          />
        </div>

        <div className="mb-4">
          <input
            type="checkbox"
            id="subscribeNewsletter"
            checked={subscribeToNewsletter}
            onChange={(e) => setSubscribeToNewsletter(e.target.checked)}
            disabled={formDisabled}
            className="mr-2 leading-tight"
          />
          <label
            htmlFor="subscribeNewsletter"
            className="text-sm text-gray-700"
          >
            I want to learn about new stories and features
          </label>
        </div>

        <div className="flex flex-col space-y-3">
          <PrimaryButton
            type="submit"
            disabled={formDisabled}
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
            {showSuccessMessage
              ? "Continue to Login"
              : "Already have an account?"}
          </button>
        </div>
      </form>
    </div>
  );
}

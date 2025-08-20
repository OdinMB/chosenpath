import { useState, useEffect } from "react";
import { useAuth } from "client/shared/auth/useAuth";
import { PrimaryButton } from "shared/components/ui";
import { notificationService } from "shared/notifications/notificationService.js";

// Password criteria utility functions
const MIN_PASSWORD_LENGTH = 8;
const hasMinLength = (pw: string) => pw.length >= MIN_PASSWORD_LENGTH;
const hasLowercase = (pw: string) => /[a-z]/.test(pw);
const hasUppercase = (pw: string) => /[A-Z]/.test(pw);
const hasNumber = (pw: string) => /\d/.test(pw);
const hasSpecialChar = (pw: string) =>
  /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw);

interface PasswordCriteriaStatus {
  minLength: boolean;
  lowercase: boolean;
  uppercase: boolean;
  number: boolean;
  specialChar: boolean;
}

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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [localSuccessMessage, setLocalSuccessMessage] = useState<string | null>(
    null
  );
  const [passwordCriteriaStatus, setPasswordCriteriaStatus] =
    useState<PasswordCriteriaStatus>({
      minLength: false,
      lowercase: false,
      uppercase: false,
      number: false,
      specialChar: false,
    });

  useEffect(() => {
    const newStatus: PasswordCriteriaStatus = {
      minLength: hasMinLength(password),
      lowercase: hasLowercase(password),
      uppercase: hasUppercase(password),
      number: hasNumber(password),
      specialChar: hasSpecialChar(password),
    };
    setPasswordCriteriaStatus(newStatus);

    // If there was a password validation error, check if the new password now satisfies the conditions
    if (fieldError === "password" && error) {
      // Check if there IS a password field error
      const criteriaValues = [
        newStatus.lowercase,
        newStatus.uppercase,
        newStatus.number,
        newStatus.specialChar,
      ];
      const satisfiedSubCriteriaCount = criteriaValues.filter(Boolean).length;

      if (newStatus.minLength && satisfiedSubCriteriaCount >= 3) {
        // Password is now valid, clear the specific password error
        setError(null);
        setFieldError(null);
      }
      // If not valid, the error message set during handleSubmit (or a previous validation) will remain,
      // and the live checkmarks in renderPasswordCriteria will show current status.
    }
  }, [password, error, fieldError]); // Add error and fieldError to dependency array to re-evaluate when they change

  useEffect(() => {
    if (showSuccessMessage) {
      setError(null);
      setFieldError(null);
    }
  }, [showSuccessMessage]);

  const resetErrors = () => {
    setError(null);
    setFieldError(null);
  };

  const successMessage = showSuccessMessage
    ? "Registration successful! You can now log in."
    : localSuccessMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetErrors();
    console.log("RegisterForm: Submit initiated");

    if (!email || !username || !password || !confirmPassword) {
      const msg = "All fields are required";
      setError(msg);
      setFieldError(
        !email
          ? "email"
          : !username
          ? "username"
          : !password
          ? "password"
          : "confirmPassword"
      );
      notificationService.addNotification({
        type: "error",
        title: "Validation Error",
        message: msg,
      });
      if (onError) onError();
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const msg = "Please enter a valid email address";
      setError(msg);
      setFieldError("email");
      notificationService.addNotification({
        type: "error",
        title: "Validation Error",
        message: msg,
      });
      if (onError) onError();
      return;
    }

    // Updated password validation
    const {
      minLength,
      lowercase,
      uppercase,
      number: numChar,
      specialChar,
    } = passwordCriteriaStatus;
    const criteriaCount = [lowercase, uppercase, numChar, specialChar].filter(
      Boolean
    ).length;

    if (!minLength || criteriaCount < 3) {
      let errorMsg =
        "Password must be at least 8 characters and meet at least 3 of the following criteria: ";
      const unmet = [];
      if (!lowercase) unmet.push("lowercase letter");
      if (!uppercase) unmet.push("uppercase letter");
      if (!numChar) unmet.push("number");
      if (!specialChar) unmet.push("special character");
      // errorMsg += unmet.join(", ") + "."; // This could be too long for the main error
      errorMsg =
        "Password must be 8+ characters and meet at least 3 of: lowercase, uppercase, number, special char.";
      setError(errorMsg);
      setFieldError("password");
      notificationService.addNotification({
        type: "error",
        title: "Password Invalid",
        message: errorMsg,
        duration: 7000,
      });
      if (onError) onError();
      return;
    }

    if (password !== confirmPassword) {
      const msg = "Passwords do not match";
      setError(msg);
      setFieldError("confirmPassword");
      notificationService.addNotification({
        type: "error",
        title: "Validation Error",
        message: msg,
      });
      if (onError) onError();
      return;
    }

    try {
      console.log("RegisterForm: Attempting registration");
      await register(email, username, password, subscribeToNewsletter);
      console.log("RegisterForm: Registration successful");
      setLocalSuccessMessage("Registration successful! You can now log in.");
      notificationService.addNotification({
        type: "success",
        title: "Registration Successful",
        message: "You can now log in.",
        autoClose: true,
        duration: 5000,
      });
      if (onSuccess) onSuccess();
    } catch (err) {
      interface ApiError extends Error {
        response?: { data?: { errorMessage?: string } };
      }
      const apiError = err as ApiError;
      const serverErrorMessage =
        apiError.response?.data?.errorMessage ||
        apiError.message ||
        "Registration failed";
      console.log("RegisterForm: Registration failed", serverErrorMessage);
      setError(serverErrorMessage);

      let specificField: string | null = null;
      if (serverErrorMessage.toLowerCase().includes("email already in use")) {
        specificField = "email";
      } else if (
        serverErrorMessage.toLowerCase().includes("username already taken")
      ) {
        specificField = "username";
      } else if (serverErrorMessage.toLowerCase().includes("password")) {
        // Generic password error from server
        specificField = "password";
      }
      setFieldError(specificField);

      notificationService.addNotification({
        type: "error",
        title: specificField ? "Input Error" : "Registration Failed",
        message: serverErrorMessage,
        autoClose: true,
        duration: 7000,
      });

      if (onError) onError();
    }
  };

  const displaySuccessMessage = successMessage;
  const formDisabled = isLoading || !!displaySuccessMessage;

  const getInputBorderClass = (fieldName: string) => {
    return fieldError === fieldName
      ? "border-red-500 focus:ring-offset-2 focus:ring-red-500"
      : "border-gray-300 focus:ring-offset-2 focus:ring-accent focus:border-accent";
  };

  const renderPasswordCriteria = () => (
    <div className="mt-2 text-xs space-y-1">
      <p
        className={
          passwordCriteriaStatus.minLength ? "text-green-600" : "text-red-600"
        }
      >
        {passwordCriteriaStatus.minLength ? "✓" : "✗"} At least 8 characters
      </p>
      <p
        className={
          passwordCriteriaStatus.lowercase ? "text-green-600" : "text-red-600"
        }
      >
        {passwordCriteriaStatus.lowercase ? "✓" : "✗"} Lowercase letter (a-z)
      </p>
      <p
        className={
          passwordCriteriaStatus.uppercase ? "text-green-600" : "text-red-600"
        }
      >
        {passwordCriteriaStatus.uppercase ? "✓" : "✗"} Uppercase letter (A-Z)
      </p>
      <p
        className={
          passwordCriteriaStatus.number ? "text-green-600" : "text-red-600"
        }
      >
        {passwordCriteriaStatus.number ? "✓" : "✗"} Number (0-9)
      </p>
      <p
        className={
          passwordCriteriaStatus.specialChar ? "text-green-600" : "text-red-600"
        }
      >
        {passwordCriteriaStatus.specialChar ? "✓" : "✗"} Special character
        (e.g., !@#$)
      </p>
      {/* Show the main password validation error message only if it's currently active */}
      {fieldError === "password" && error && (
        <p className="text-red-700 font-semibold mt-1">{error}</p>
      )}
    </div>
  );

  return (
    <div className="p-4">
      {error && !fieldError && (
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
            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 ${getInputBorderClass(
              "email"
            )}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              resetErrors();
            }}
            placeholder="Your email"
            disabled={formDisabled}
            required
          />
          {fieldError === "email" && error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
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
            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 ${getInputBorderClass(
              "username"
            )}`}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              resetErrors();
            }}
            placeholder="Choose a username"
            disabled={formDisabled}
            required
          />
          {fieldError === "username" && error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
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
            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 ${getInputBorderClass(
              "password"
            )}`}
            value={password}
            onChange={(e) => {
              setPassword(
                e.target.value
              ); /* Error reset logic is now primarily in useEffect */
            }}
            placeholder="Create a password"
            disabled={formDisabled}
            required
          />
          {renderPasswordCriteria()}
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
            className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 ${getInputBorderClass(
              "confirmPassword"
            )}`}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (password !== e.target.value) {
                setError("Passwords do not match");
                setFieldError("confirmPassword");
              } else if (fieldError === "confirmPassword") {
                resetErrors();
              }
            }}
            placeholder="Confirm your password"
            disabled={formDisabled}
            required
          />
          {fieldError === "confirmPassword" && error && (
            <p className="text-xs text-red-500 mt-1">{error}</p>
          )}
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

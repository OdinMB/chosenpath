import { useState } from "react";
import { Modal } from "shared/components/ui/Modal";
import { PrimaryButton } from "components/ui";

interface NewsletterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (email: string) => Promise<void>;
}

export function NewsletterModal({
  isOpen,
  onClose,
  onSubmit,
}: NewsletterModalProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await onSubmit(email.trim());
      setSuccess(true);
      setEmail("");
    } catch (err) {
      let errorMessage =
        err instanceof Error ? err.message : "Failed to subscribe";

      // Show more user-friendly messages for common errors
      if (errorMessage.includes("already subscribed")) {
        setSuccess(true); // Still show success screen for already subscribed users
        return;
      } else if (
        errorMessage.toLowerCase().includes("network") ||
        errorMessage.includes("fetch")
      ) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else if (errorMessage.includes("400")) {
        errorMessage = "Invalid email address. Please check and try again.";
      } else if (errorMessage.includes("500")) {
        errorMessage = "Server error. Please try again later.";
      }

      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    // Reset state when closing
    if (!isSubmitting) {
      setTimeout(() => {
        setEmail("");
        setError(null);
        setSuccess(false);
      }, 300); // Slight delay to avoid visual jumps
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Stay Updated"
      width="md"
    >
      <div className="py-2">
        {/* Newsletter Image with specific cropping */}
        <div className="mb-4 rounded-lg overflow-hidden h-48">
          <img
            src="/newsletter.jpeg"
            alt="Newsletter"
            className="w-full object-cover h-auto"
            style={{
              objectPosition: "center 15%",
              transform: "scale(1.35)",
              marginTop: "-10%",
            }}
          />
        </div>

        {success ? (
          <div className="text-center space-y-4 py-6">
            <h3 className="text-lg font-medium text-accent">
              Thanks for subscribing!
            </h3>
            <p className="text-gray-600">
              We'll keep you updated with the latest news and features.
            </p>
            <PrimaryButton onClick={handleClose} className="mt-4">
              Close
            </PrimaryButton>
          </div>
        ) : (
          <>
            <p className="mb-4 text-gray-600">
              Be the first to know about new stories, features, and updates to
              the Chosen Path platform.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-700 mb-1 hidden"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full h-10 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent border-primary-100 bg-white text-primary shadow-sm placeholder-primary-400"
                  required
                  aria-label="Email for newsletter"
                  autoComplete="email"
                  disabled={isSubmitting}
                />
              </div>

              {error && (
                <div
                  className="text-sm text-red-500 p-2 bg-red-50 rounded"
                  role="alert"
                >
                  {error}
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-600 hover:text-gray-800 text-sm px-4 py-2 rounded"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>

                <PrimaryButton
                  type="submit"
                  disabled={isSubmitting || !email.trim()}
                  className="whitespace-nowrap"
                >
                  {isSubmitting ? "Sending..." : "Subscribe"}
                </PrimaryButton>
              </div>
            </form>
          </>
        )}
      </div>
    </Modal>
  );
}

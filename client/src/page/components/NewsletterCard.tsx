import { PrimaryButton } from "components/ui";
import { Icons } from "../../shared/components/ui/Icons";

type NewsletterCardProps = {
  onOpenNewsletter: () => void;
  className?: string;
};

export const NewsletterCard = ({
  onOpenNewsletter,
  className = "",
}: NewsletterCardProps) => {
  return (
    <div
      className={`w-full bg-white rounded-lg border border-primary-100 overflow-hidden h-full ${className}`}
    >
      <div className="flex h-full">
        <div
          className="relative w-20 overflow-hidden flex-shrink-0 bg-accent-50 cursor-pointer h-full"
          onClick={onOpenNewsletter}
        >
          <div className="flex items-center justify-center h-full w-full text-accent-600">
            <Icons.Mail className="h-8 w-8" />
          </div>
        </div>

        <div className="w-full p-4 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg text-primary-800">Newsletter</h3>
            <PrimaryButton onClick={onOpenNewsletter} className="ml-4">
              Subscribe
            </PrimaryButton>
          </div>

          <div className="flex flex-col gap-1 text-primary-500 mb-4">
            <div className="flex items-center gap-8">
              <span className="text-xs font-semibold">~ Monthly</span>
            </div>
          </div>

          <p className="text-sm text-primary-600 mb-4 line-clamp-3">
            Be the first to know about new stories, features, and updates to the
            Chosen Path platform.
          </p>

          <div className="flex flex-wrap gap-1 mt-auto">
            <span className="inline-block text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md">
              Updates
            </span>
            <span className="inline-block text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md">
              New Stories
            </span>
            <span className="inline-block text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md">
              Early Access
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

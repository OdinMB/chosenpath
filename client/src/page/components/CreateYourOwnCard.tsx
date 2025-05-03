import { PrimaryButton } from "components/ui";
import { Icons } from "../../shared/components/ui/Icons";

type CreateYourOwnCardProps = {
  onCreateStory: () => void;
  className?: string;
};

export const CreateYourOwnCard = ({
  onCreateStory,
  className = "",
}: CreateYourOwnCardProps) => {
  return (
    <div
      className={`w-full bg-white rounded-lg border border-primary-100 overflow-hidden h-full ${className}`}
    >
      <div className="flex h-full">
        <div
          className="relative w-20 overflow-hidden flex-shrink-0 bg-primary-50 cursor-pointer h-full"
          onClick={onCreateStory}
        >
          <div className="flex items-center justify-center h-full w-full text-primary-500">
            <Icons.Plus className="h-8 w-8" />
          </div>
        </div>

        <div className="w-full p-4 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg text-primary-800">Your Own Story</h3>
            <PrimaryButton onClick={onCreateStory} className="ml-4">
              Create
            </PrimaryButton>
          </div>

          <div className="flex flex-col gap-1 text-primary-500 mb-4">
            <div className="flex items-center gap-8">
              <span className="text-xs font-semibold">Custom settings</span>
            </div>
          </div>

          <p className="text-sm text-primary-600 mb-4 line-clamp-3">
            Create a unique story with your own premise, characters, and
            setting.
          </p>

          <div className="flex flex-wrap gap-1 mt-auto">
            <span className="inline-block text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md">
              Your imagination
            </span>
            <span className="inline-block text-xs px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md">
              Personalized
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

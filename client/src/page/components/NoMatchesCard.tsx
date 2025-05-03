import { PrimaryButton } from "components/ui";
import { Icons } from "../../shared/components/ui/Icons";

type NoMatchesCardProps = {
  onClearFilters: () => void;
  className?: string;
};

export const NoMatchesCard = ({
  onClearFilters,
  className = "",
}: NoMatchesCardProps) => {
  return (
    <div
      className={`w-full bg-white rounded-lg border border-primary-100 overflow-hidden h-full ${className}`}
    >
      <div className="flex h-full">
        <div className="relative w-20 overflow-hidden flex-shrink-0 bg-gray-100 h-full">
          <div className="flex items-center justify-center h-full w-full text-gray-400">
            <Icons.Search className="h-8 w-8" />
          </div>
        </div>

        <div className="w-full p-4 flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg text-primary-800">No Matches</h3>
            <PrimaryButton onClick={onClearFilters} className="ml-4">
              Clear Filters
            </PrimaryButton>
          </div>

          <div className="flex flex-col gap-1 text-primary-500 mb-4 mt-auto">
            <div className="flex items-center gap-8">
              <span className="text-xs font-semibold">Try fewer filters</span>
            </div>
          </div>

          <p className="text-sm text-primary-600 mb-4">
            No templates match your current filters. Try adjusting your filter
            criteria or create your own story instead.
          </p>

          <div className="flex flex-wrap gap-1 mt-auto">&nbsp;</div>
        </div>
      </div>
    </div>
  );
};

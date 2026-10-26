import { InfoIcon } from "components/ui";
import { GROUP_COUNT_MAX, GROUP_COUNT_MIN } from "page/hooks/useGroupStoryCreation";

interface GroupStartFieldProps {
  enabled: boolean;
  /** As typed; NaN while the field is empty. The start clamps it to 2–12. */
  count: number;
  onEnabledChange: (enabled: boolean) => void;
  onCountChange: (count: number) => void;
  disabled?: boolean;
}

/**
 * "Start several groups", for signed-in users on a World's settings: the
 * checkbox, and while it is ticked, the number of groups (2 to 12).
 */
export function GroupStartField({
  enabled,
  count,
  onEnabledChange,
  onCountChange,
  disabled = false,
}: GroupStartFieldProps) {
  return (
    <div className="space-y-3">
      <div className="items-center flex">
        <input
          id="start-several-groups"
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          className="h-5 w-5 md:h-6 md:w-6 rounded border-primary-100 text-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
          disabled={disabled}
        />
        <label
          htmlFor="start-several-groups"
          className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary"
        >
          Start several groups
          <InfoIcon
            tooltipText="One story per group, all with these settings. Afterwards you print a seat card with a code for each student."
            className="ml-2 -mt-0.5"
            position="top"
          />
        </label>
      </div>

      {enabled && (
        <div className="flex items-center gap-3 pl-8 md:pl-10">
          <label
            htmlFor="group-count"
            className="text-sm md:text-base font-medium text-primary"
          >
            Number of groups
          </label>
          <input
            id="group-count"
            type="number"
            inputMode="numeric"
            min={GROUP_COUNT_MIN}
            max={GROUP_COUNT_MAX}
            step={1}
            value={Number.isNaN(count) ? "" : count}
            onChange={(e) => onCountChange(e.target.valueAsNumber)}
            aria-describedby="group-count-range"
            className="w-20 px-3 py-2 border border-primary-100 rounded-md shadow-sm text-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent focus:border-accent"
            disabled={disabled}
          />
          <span id="group-count-range" className="text-xs md:text-sm text-primary-600">
            {GROUP_COUNT_MIN} to {GROUP_COUNT_MAX}
          </span>
        </div>
      )}
    </div>
  );
}

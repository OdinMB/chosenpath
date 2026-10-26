import { useNavigate } from "react-router-dom";
import { ColoredBox, Icons, InfoIcon, PrimaryButton } from "components/ui";
import {
  STORY_COUNT_MAX,
  STORY_COUNT_MIN,
  clampStoryCount,
  stepStoryCount,
} from "page/hooks/useMultiStoryCreation";

interface MultiStoryStartFieldProps {
  enabled: boolean;
  /** As typed; NaN while the field is empty. The start clamps it to 2–12. */
  count: number;
  onEnabledChange: (enabled: boolean) => void;
  onCountChange: (count: number) => void;
  disabled?: boolean;
}

/** The pages that explain starting several stories at once, each for its audience. */
const AUDIENCE_PAGES = [
  { path: "/for-educators", label: "educators" },
  { path: "/for-coaches", label: "coaches" },
  { path: "/for-therapists", label: "therapists" },
  { path: "/for-storytellers", label: "storytellers" },
];

/** ", " between the items of a list, " and " before its last one. */
function listSeparator(index: number, length: number): string {
  if (index >= length - 1) return "";
  return index === length - 2 ? " and " : ", ";
}

/**
 * "Start several stories at once", for signed-in users on a World's settings:
 * the checkbox, with where the feature is explained, and while it is ticked,
 * the number of stories (2 to 12) at the centre of a highlighted panel, since
 * the form then starts several stories rather than one.
 */
export function MultiStoryStartField({
  enabled,
  count,
  onEnabledChange,
  onCountChange,
  disabled = false,
}: MultiStoryStartFieldProps) {
  const navigate = useNavigate();
  const shownCount = clampStoryCount(count);

  return (
    <ColoredBox
      as="div"
      colorType={enabled ? "accent" : "grey"}
      isActive={enabled}
      leftBorder={enabled}
      className="p-4 md:p-6 space-y-4"
    >
      <div>
        <div className="items-center flex">
          <input
            id="start-several-stories"
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            className="h-5 w-5 md:h-6 md:w-6 rounded border-primary-100 text-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
            disabled={disabled}
          />
          <label
            htmlFor="start-several-stories"
            className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary"
          >
            Start several stories at once
            <InfoIcon
              tooltipText="Starts several copies of this story, all with these settings. Each copy has its own seat codes, for one player or several."
              className="ml-2 -mt-0.5"
              position="top"
            />
          </label>
        </div>
        <p className="mt-1 pl-8 md:pl-10 text-xs md:text-sm text-primary-600">
          See how{" "}
          {AUDIENCE_PAGES.map((page, index) => (
            <span key={page.path}>
              <a
                href={page.path}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(page.path);
                }}
                // Underlined: in this muted line, colour alone wouldn't set the links apart
                className="text-link underline focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent rounded"
              >
                {page.label}
              </a>
              {listSeparator(index, AUDIENCE_PAGES.length)}
            </span>
          ))}{" "}
          use it.
        </p>
      </div>

      {enabled && (
        <div className="border-t border-accent-200 pt-4 text-center space-y-4">
          <h3
            aria-live="polite"
            className="text-xl md:text-2xl font-semibold text-primary-800"
          >
            You're starting {shownCount} stories at once
          </h3>

          <div>
            <label
              htmlFor="story-count"
              className="block text-sm md:text-base font-medium text-primary"
            >
              Number of stories
            </label>
            <div className="mt-2 flex items-center justify-center gap-3 sm:gap-4">
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                aria-label="One story fewer"
                aria-controls="story-count"
                onClick={() => onCountChange(stepStoryCount(count, -1))}
                disabled={disabled || shownCount <= STORY_COUNT_MIN}
                className="h-12 w-12"
              >
                <Icons.Minus className="h-4 w-4" />
              </PrimaryButton>
              <input
                id="story-count"
                type="number"
                inputMode="numeric"
                min={STORY_COUNT_MIN}
                max={STORY_COUNT_MAX}
                step={1}
                value={Number.isNaN(count) ? "" : count}
                onChange={(e) => onCountChange(e.target.valueAsNumber)}
                // Leaving the field shows the number that will start
                onBlur={() => onCountChange(shownCount)}
                aria-describedby="story-count-range"
                className="w-24 h-14 px-2 bg-white border border-accent rounded-md shadow-sm text-center font-montserrat text-3xl md:text-4xl font-semibold text-primary-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                disabled={disabled}
              />
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                aria-label="One story more"
                aria-controls="story-count"
                onClick={() => onCountChange(stepStoryCount(count, 1))}
                disabled={disabled || shownCount >= STORY_COUNT_MAX}
                className="h-12 w-12"
              >
                <Icons.Plus className="h-4 w-4" />
              </PrimaryButton>
            </div>
            <p
              id="story-count-range"
              className="mt-2 text-xs md:text-sm text-primary-600"
            >
              {STORY_COUNT_MIN} to {STORY_COUNT_MAX} stories
            </p>
          </div>

          <p className="max-w-md mx-auto text-sm md:text-base text-primary-700">
            Each story gets its own seat codes. Once they've started, you get
            printable cards to hand out: one per seat, with its code and a QR
            code.
          </p>
        </div>
      )}
    </ColoredBox>
  );
}

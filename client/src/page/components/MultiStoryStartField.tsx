import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icons, InfoIcon } from "components/ui";
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

interface StepperButtonProps {
  label: string;
  /** The count is at this button's end of 2 to 12. */
  atLimit: boolean;
  /** The whole form is busy. */
  disabled: boolean;
  onStep: () => void;
  children: ReactNode;
}

/**
 * The − or + beside the count. At its limit it stays focusable (aria-disabled),
 * so a keyboard user stepping to 2 or 12 keeps their place; while the form is
 * busy it is disabled outright. Either way it looks unavailable and has no
 * hover look, and its focus ring shows for keyboard focus only.
 */
function StepperButton({
  label,
  atLimit,
  disabled,
  onStep,
  children,
}: StepperButtonProps) {
  const unavailable = disabled || atLimit;
  return (
    <button
      type="button"
      aria-label={label}
      aria-controls="story-count"
      aria-disabled={atLimit || undefined}
      disabled={disabled}
      onClick={() => {
        if (!unavailable) onStep();
      }}
      className={`inline-flex h-12 w-12 items-center justify-center rounded-lg border bg-white text-primary-800 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent ${
        unavailable
          ? "border-primary-200 opacity-40 cursor-not-allowed"
          : "border-primary-400 hover:border-accent hover:bg-accent-50"
      }`}
    >
      {children}
    </button>
  );
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
    // Not ColoredBox: its own bg-white outranks its active tint in the
    // built CSS. The left bar keeps its width unticked (transparent), so
    // ticking the box moves nothing.
    <div
      id="several-stories-panel"
      className={`p-4 md:p-6 space-y-4 rounded-lg border border-l-8 shadow-md transition-colors duration-300 motion-reduce:transition-none ${
        enabled
          ? "border-accent-800 bg-accent-100"
          : "border-primary-100 border-l-transparent bg-white"
      }`}
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
          {/* The info button beside the label, not in it, so the checkbox's name is the label's text */}
          <div className="ml-3 md:ml-4 text-sm md:text-base font-medium text-primary">
            <label htmlFor="start-several-stories">
              Start several stories at once
            </label>
            <InfoIcon
              label="About starting several stories"
              tooltipText="Starts several copies of this story, all with these settings. Each copy has its own seat codes, for one player or several."
              className="ml-2 -mt-0.5"
              // Narrow enough for the tooltip's shift to keep it on a phone's screen
              contentClassName="max-w-[min(20rem,calc(100vw-1rem))]"
              position="top"
            />
          </div>
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
              <StepperButton
                label="One story fewer"
                atLimit={shownCount <= STORY_COUNT_MIN}
                disabled={disabled}
                onStep={() => onCountChange(stepStoryCount(count, -1))}
              >
                <Icons.Minus className="h-4 w-4" />
              </StepperButton>
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
              <StepperButton
                label="One story more"
                atLimit={shownCount >= STORY_COUNT_MAX}
                disabled={disabled}
                onStep={() => onCountChange(stepStoryCount(count, 1))}
              >
                <Icons.Plus className="h-4 w-4" />
              </StepperButton>
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
    </div>
  );
}

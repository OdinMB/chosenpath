import type { ReactNode } from "react";
import type { Beat, OutcomeAtEnd } from "core/types";
import { Icons, PrimaryButton } from "components/ui";
import { riskDisplayText } from "game/hooks/useChoiceFormatting";
import { StoryOutcomes } from "./StoryOutcomes";
import {
  storyPath,
  type PathLever,
  type PathResult,
  type PathStats,
  type PathStep,
} from "game/utils/storyPath";

/*
 * The recap below a story's ending: the player's path, turn by turn (what
 * they chose and how it turned out), so a group can walk back through its
 * decisions; where the story's questions landed; then a way out. It uses no
 * hooks, so its buttons' handlers can be reached in a test without a DOM.
 */

export const MY_STORIES_PATH = "/users/my-stories";
export const HOME_PATH = "/";

const RECAP_TITLE_ID = "story-recap-title";

/** Each roll's result with the game's face for it (PreviousChoiceVisualizer's emoji). */
const RESULTS: Record<PathResult, { label: string; face: string; className: string }> = {
  favorable: { label: "Favorable", face: "😀", className: "border-accent bg-accent-50" },
  mixed: { label: "Mixed", face: "😐", className: "border-primary-300 bg-primary-50" },
  unfavorable: { label: "Unfavorable", face: "🙁", className: "border-tertiary bg-tertiary-50" },
};

const CHIP = "inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-sm text-primary";

/** Hidden punctuation that ends a fact for screen readers, which run the chips together otherwise. */
const SPOKEN_STOP = <span className="sr-only">. </span>;

function Chip({ className = "border-primary-200", children }: { className?: string; children: ReactNode }) {
  return (
    <span className={`${CHIP} ${className}`}>
      {children}
      {SPOKEN_STOP}
    </span>
  );
}

function leverText({ kind, stat, change }: PathLever): string {
  const named = kind === "sacrifice" ? `Paid with ${stat}` : `Gained ${stat}`;
  return change ? `${named} ${change}` : named;
}

function Outcome({ step }: { step: PathStep }) {
  if (step.kind === "exploration") {
    return (
      <Chip>
        <span aria-hidden="true">
          <Icons.Fork className="h-4 w-4" />
        </span>
        <span className="sr-only">Result: </span>A choice of direction
      </Chip>
    );
  }
  if (!step.result) return null;
  const result = RESULTS[step.result];
  return (
    <Chip className={result.className}>
      <span aria-hidden="true">{result.face}</span>
      <span className="sr-only">Result: </span>
      {result.label}
    </Chip>
  );
}

function PathEntry({ step, isLast }: { step: PathStep; isLast: boolean }) {
  return (
    <li className="relative pl-12 pb-8 last:pb-0">
      {!isLast && (
        <span
          aria-hidden="true"
          className="absolute left-[15px] top-9 bottom-1 border-l-2 border-primary-200"
        />
      )}
      <span
        aria-hidden="true"
        className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-secondary bg-white text-sm font-semibold text-secondary"
      >
        {step.turn}
      </span>
      <h3 className="pt-1 text-sm font-semibold text-primary-700">
        Turn {step.turn}
        <span className="sr-only">: </span>
        <span aria-hidden="true" className="mx-1.5">
          ·
        </span>
        <span className="font-normal">{step.beatTitle}</span>
      </h3>
      <p className="mt-2 text-base md:text-lg text-primary">
        <span className="sr-only">You chose: </span>
        {step.choice}
      </p>
      <p className="mt-3 flex flex-wrap gap-2">
        <Outcome step={step} />
        {step.kind === "challenge" && step.risk && (
          <Chip>Risk: {riskDisplayText(step.risk)}</Chip>
        )}
        {step.lever && <Chip>{leverText(step.lever)}</Chip>}
      </p>
    </li>
  );
}

interface StoryRecapProps {
  /** The player's beats, the ending's last. */
  beats: Beat[];
  stats: PathStats;
  /** Where the story's outcomes ended (the state's outcomesAtEnd); none shows no section. */
  outcomes?: OutcomeAtEnd[];
  /** My Stories needs an account; a player who joined without one goes home. */
  signedIn: boolean;
  /** Leaves the story for a page of the site. */
  onLeave: (to: string) => void;
}

export function StoryRecap({
  beats,
  stats,
  outcomes,
  signedIn,
  onLeave,
}: StoryRecapProps) {
  const steps = storyPath(beats, stats);
  return (
    <section
      aria-labelledby={RECAP_TITLE_ID}
      className="max-w-2xl mx-auto mt-10 border-t border-primary-200 pt-8"
    >
      <h2
        id={RECAP_TITLE_ID}
        className="text-xl md:text-2xl font-bold text-center text-primary"
      >
        Your path
      </h2>
      <p className="mt-2 mb-8 text-center text-primary-700">
        Every choice you made, turn by turn, and how it turned out.
      </p>
      {steps.length > 0 && (
        <ol>
          {steps.map((step, index) => (
            <PathEntry
              key={step.turn}
              step={step}
              isLast={index === steps.length - 1}
            />
          ))}
        </ol>
      )}
      <StoryOutcomes outcomes={outcomes} />
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        {signedIn && (
          <PrimaryButton
            type="button"
            size="lg"
            leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
            onClick={() => onLeave(MY_STORIES_PATH)}
          >
            My Stories
          </PrimaryButton>
        )}
        {/* Home is the only way out for a player without an account, and then the main one */}
        <PrimaryButton
          type="button"
          size="lg"
          variant={signedIn ? "outline" : "primary"}
          leftBorder={!signedIn}
          onClick={() => onLeave(HOME_PATH)}
        >
          Home
        </PrimaryButton>
      </div>
    </section>
  );
}

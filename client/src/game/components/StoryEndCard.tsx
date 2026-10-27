import { ColoredBox, PrimaryButton } from "components/ui";
import type { ClientStoryState } from "core/types";
import { useAuth } from "client/shared/auth/useAuth";
import { STORY_END_EXITS, endStatGroups } from "../utils/storyEnd";

/** Fixed questions for a debrief after any story; written by hand, not by the AI. */
const TALK_ABOUT_IT_QUESTIONS = [
  "Which moment changed the story the most?",
  "Which choice would you make differently next time, and why?",
  "Pick another character. What did they want, and did they get it?",
  "What surprised you about how the story ended?",
];

interface StoryEndCardProps {
  storyState: ClientStoryState;
  /** Leaves the story for the given page. */
  onExitGame: (to: string) => void;
}

/**
 * The closing card below a story's ending: where the player ended up, questions
 * to talk about, and the way out of the story. My Stories is offered only to a
 * signed-in player: one who joined by code without an account would land on sign-in.
 */
export function StoryEndCard({ storyState, onExitGame }: StoryEndCardProps) {
  const statGroups = endStatGroups(storyState);
  const { isAuthenticated } = useAuth();

  return (
    <ColoredBox
      colorType="accent"
      className="max-w-2xl mx-auto mt-8 p-5 md:p-8 space-y-8 font-montserrat text-primary"
    >
      {statGroups.length > 0 && (
        <section aria-labelledby="story-end-stats">
          <h3 id="story-end-stats" className="text-xl font-bold">
            Where you ended up
          </h3>
          <p className="mt-1 text-sm text-primary-600">
            How things stood when the story ended.
          </p>
          <div className="mt-4 space-y-5">
            {statGroups.map(({ group, stats }) => (
              <div key={group}>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-primary-600">
                  {group}
                </h4>
                <dl className="mt-1 divide-y divide-primary-100">
                  {stats.map((stat) => (
                    <div
                      key={stat.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2"
                    >
                      <dt className="text-primary-700">{stat.name}</dt>
                      <dd className="font-semibold text-right">{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="story-end-talk">
        <h3 id="story-end-talk" className="text-xl font-bold">
          Talk about it
        </h3>
        <p className="mt-1 text-sm text-primary-600">
          Questions to think over, or to discuss with a group or class.
        </p>
        <ol className="mt-4 list-decimal pl-6 space-y-3 text-base md:text-lg">
          {TALK_ABOUT_IT_QUESTIONS.map((question) => (
            <li key={question} className="pl-1">
              {question}
            </li>
          ))}
        </ol>
      </section>

      <nav
        aria-label="Leave the story"
        className="flex flex-col sm:flex-row gap-3"
      >
        {isAuthenticated && (
          <PrimaryButton
            size="lg"
            className="sm:flex-1"
            onClick={() => onExitGame(STORY_END_EXITS.myStories)}
          >
            My Stories
          </PrimaryButton>
        )}
        <PrimaryButton
          size="lg"
          variant={isAuthenticated ? "outline" : "primary"}
          className="sm:flex-1"
          onClick={() => onExitGame(STORY_END_EXITS.home)}
        >
          Home
        </PrimaryButton>
      </nav>
    </ColoredBox>
  );
}

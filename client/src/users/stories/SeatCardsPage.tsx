import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ExtendedStoryMetadata } from "core/types/api";
import { Checkbox, Icons, LoadingSpinner, PrimaryButton } from "components/ui";
import { userStoriesApi } from "client/shared/apiClient";
import { seatCardsFor } from "./seatCards";
import { SeatCard } from "./SeatCard";

/*
 * /users/seat-cards: the printable seat cards of the stories the signed-in
 * user started, outside the account layout so that only the cards print. The
 * toolbar (screen only) picks the stories; ?stories=<ids> preselects them, as
 * the group start does.
 */

/** The story ids a ?stories= list names. */
function preselectedIds(param: string | null): Set<string> {
  return new Set(
    (param ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function startedAt(story: ExtendedStoryMetadata): string {
  return new Date(story.createdAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function SeatCardsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [stories, setStories] = useState<ExtendedStoryMetadata[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() =>
    preselectedIds(searchParams.get("stories"))
  );

  useEffect(() => {
    let cancelled = false;
    userStoriesApi
      .getCreatedStories()
      .then((feed) => {
        if (!cancelled) setStories(feed.stories);
      })
      .catch(() => {
        // The API client has shown what went wrong
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (storyId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  const newestFirst = [...(stories ?? [])].sort(
    (a, b) => b.createdAt - a.createdAt
  );
  const cards = seatCardsFor(stories ?? [], selected);

  return (
    <div className="min-h-screen bg-white font-lora">
      <div className="print:hidden border-b border-primary-100">
        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-primary-800">
              Seat cards
            </h1>
            <div className="flex gap-3">
              <PrimaryButton
                type="button"
                variant="outline"
                leftBorder={false}
                leftIcon={<Icons.ArrowLeft className="h-4 w-4" />}
                onClick={() => navigate("/users/my-stories")}
              >
                My Stories
              </PrimaryButton>
              <PrimaryButton
                type="button"
                onClick={() => window.print()}
                disabled={cards.length === 0}
              >
                Print
              </PrimaryButton>
            </div>
          </div>
          <p className="text-sm text-primary-700">
            One card per student: their group, their seat code, a join link and
            a QR code. Students need no account. They scan the card or type the
            code on the home page.
          </p>

          {stories === null && !loadFailed && (
            <LoadingSpinner message="Loading your stories" />
          )}
          {loadFailed && (
            <p className="text-sm text-primary-700">
              We couldn't load your stories. Please reload the page.
            </p>
          )}
          {stories !== null && stories.length === 0 && (
            <p className="text-sm text-primary-700">
              You haven't started a story yet. Open a World from the library and
              choose "Start several groups".
            </p>
          )}
          {newestFirst.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-primary mb-2">
                Stories to print
              </legend>
              <ul className="max-h-64 overflow-y-auto space-y-2">
                {newestFirst.map((story) => (
                  <li key={story.id} className="flex items-center gap-3">
                    <Checkbox
                      id={`seat-cards-${story.id}`}
                      checked={selected.has(story.id)}
                      onChange={() => toggle(story.id)}
                    />
                    <label
                      htmlFor={`seat-cards-${story.id}`}
                      className="text-sm text-primary-800"
                    >
                      {story.title}
                      <span className="text-primary-600">
                        {" "}
                        · started {startedAt(story)} · {story.players.length}{" "}
                        {story.players.length === 1 ? "seat" : "seats"}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-4 md:p-6 print:p-0 print:max-w-none">
        {stories !== null && stories.length > 0 && cards.length === 0 && (
          <p className="print:hidden text-sm text-primary-700">
            Choose the stories whose seat cards you want to print.
          </p>
        )}
        {cards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 print:grid-cols-2 print:gap-3">
            {cards.map((card) => (
              <SeatCard key={card.code} card={card} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

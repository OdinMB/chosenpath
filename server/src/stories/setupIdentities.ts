import type { PlayerCount, StoryState } from "core/types/index.js";
import { storyStateStartProblem } from "core/utils/outcomeReadiness.js";
import { errorClass } from "../game/services/retryOnce.js";

/*
 * A seat's three identities with one name give the player no choice of name.
 * The setup's own rule asks for three names unless the premise names the
 * character (setupPromptText.ts); the third playthroughs' New Avalon setup
 * (2026-10-01) offered "Ari" three times all the same, she, he and they, and
 * nothing in the game read it (the eval's distinctIdentities check did). A
 * setup whose names clash is asked for once more, a fresh sample of the same
 * request, and the second is kept only where its names differ and the story
 * can start from it: a story never fails over names.
 */

/** Titles and articles an identity's name may open with; a name that opens with an article is a role. */
const NAME_TITLES = /^(dr|mr|mrs|ms|mx|miss|sir|lady|lord|dame|captain|capt|professor|prof|doctor|detective|officer|agent|the|a|an)\.?$/i;
const ARTICLE = /^(the|a|an)\s/i;

/** The name an identity is called by: its first word after any title ("Dr. Alex Chen" is "alex"). */
function calledBy(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const rest = words.filter((word) => !NAME_TITLES.test(word));
  return (rest[0] ?? words[words.length - 1] ?? "").toLowerCase().replace(/[^\p{L}\p{N}'’-]/gu, "");
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether the premise holds this word as written, as a word of its own. */
const premiseNames = (premise: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escaped(word)}(?![\\p{L}\\p{N}])`, "u").test(premise);

/**
 * The seats whose identities share the name they are called by, where the
 * premise doesn't give the character that name (a name opening with an
 * article, "The Detective", is a role and never the premise's name). The
 * eval's setup check distinctIdentities reads the same rule on the setup reply.
 */
export function seatsWithSharedIdentityNames(state: Pick<StoryState, "characterSelectionOptions">, premise: string): string[] {
  return Object.entries(state.characterSelectionOptions ?? {}).flatMap(([slot, options]) => {
    const names = (options?.possibleCharacterIdentities ?? []).map((identity) => (typeof identity?.name === "string" ? identity.name.trim() : "")).filter(Boolean);
    const called = names.map(calledBy);
    const clashes = names.some((name, i) => {
      if (called.indexOf(called[i]) === i && called.lastIndexOf(called[i]) === i) return false;
      const word = name.split(/\s+/).find((w) => calledBy(w) === called[i]) ?? name;
      return ARTICLE.test(name) || !premiseNames(premise, word);
    });
    return clashes ? [slot] : [];
  });
}

/**
 * The setup to keep, where its seats' identities may share a name: `first`
 * where none does; otherwise one more setup (`again`, a fresh sample of the
 * same request), kept where its names differ and the story can start from it,
 * else `first`. A failed second call keeps `first` too. The log lines name the
 * seats and an error's class, never a name or the premise.
 */
export async function withDistinctIdentityNames(
  first: StoryState,
  again: () => Promise<StoryState>,
  premise: string,
  playerCount: PlayerCount,
  log: (line: string) => void
): Promise<StoryState> {
  const seats = seatsWithSharedIdentityNames(first, premise);
  if (seats.length === 0) return first;
  log(`the identities of ${seats.join(", ")} share a name; asking for the setup once more`);
  let second: StoryState;
  try {
    second = await again();
  } catch (error) {
    log(`the second setup failed (${errorClass(error)}); keeping the first, whose identities share a name`);
    return first;
  }
  if (storyStateStartProblem(second, playerCount)) {
    log("the second setup can't start; keeping the first, whose identities share a name");
    return first;
  }
  const still = seatsWithSharedIdentityNames(second, premise);
  if (still.length > 0) {
    log(`the identities of ${still.join(", ")} share a name in the second setup too; keeping the first`);
    return first;
  }
  return second;
}

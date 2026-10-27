import type { Beat, ClientStoryState } from "core/types";
import { BeatContent } from "../../../../src/game/components/BeatContent";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";
import { beat, clientStoryState, player } from "../../../helpers/storyFixtures";

// react-markdown is an ES module Jest cannot parse; the text as it is will do here
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => children,
}));
jest.mock("../../../../src/game/components/PreviousChoiceVisualizer", () => ({
  PreviousChoiceVisualizer: () => "[previous choice]",
}));
jest.mock("../../../../src/game/components/feedback/BeatFeedback", () => ({
  BeatFeedback: () => "[feedback]",
}));

function renderBeat(
  beats: Beat[],
  displayedBeatIndex: number,
  overrides: Partial<ClientStoryState> = {}
): string {
  const storyState = clientStoryState({
    title: "The Lamps of Wrenhaven",
    players: { player1: player(beats) },
    ...overrides,
  });
  return renderMarkup(
    <BeatContent
      storyState={storyState}
      currentBeat={beats[displayedBeatIndex] ?? null}
      previousBeatIndex={displayedBeatIndex > 0 ? displayedBeatIndex - 1 : null}
      displayedBeatIndex={displayedBeatIndex}
      beatHistory={beats}
      isViewingLatestBeat={displayedBeatIndex === beats.length - 1}
      localSelectedChoice={undefined}
      isRequestPending={() => false}
      onChoiceSelected={jest.fn()}
    />
  );
}

/** The page's headings, in order, as "h1: text". */
function headings(html: string): string[] {
  return [...html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/g)].map(
    ([, level, inner]) => `${level}: ${accessibleText(inner ?? "")}`
  );
}

/** A beat whose one option the player took, or not yet with choice -1. */
function played(title: string, choice = 0): Beat {
  return {
    ...beat(title, choice),
    options: [
      { optionType: "exploration", resourceType: "normal", text: "Walk on" },
    ],
  };
}

describe("BeatContent's headings", () => {
  const ended = [played("Arrival"), played("Crossroads"), played("The End", -1)];

  it("names the story above its first beat", () => {
    expect(headings(renderBeat(ended.slice(0, 1), 0))).toEqual([
      "h1: The Lamps of Wrenhaven",
      "h2: Arrival",
    ]);
  });

  it("names the story again above its ending, with the ending's title right before its text", () => {
    const html = renderBeat(ended, 2, { gameOver: true });

    expect(headings(html)).toEqual([
      "h1: The Lamps of Wrenhaven",
      "h2: The End",
    ]);
    expect(html).toMatch(/<\/h2><div class="narrative-container/);
  });

  it("names only the beat on the beats between", () => {
    expect(headings(renderBeat(ended, 1, { gameOver: true }))).toEqual([
      "h2: Crossroads",
    ]);
  });
});

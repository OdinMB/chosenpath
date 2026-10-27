import type { Beat, BeatOption, ClientStoryState } from "core/types";
import { BeatContent } from "../../../../src/game/components/BeatContent";
import { renderMarkup } from "../../../helpers/staticMarkup";
import { beat, clientStoryState, player } from "../../../helpers/storyFixtures";

// What the beat shows around its choices is all these tests read
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => children,
}));
jest.mock("../../../../src/game/components/feedback/BeatFeedback", () => ({
  BeatFeedback: () => "[feedback]",
}));
jest.mock("../../../../src/game/components/PreviousChoiceVisualizer", () => ({
  PreviousChoiceVisualizer: () => "[previous choice]",
}));
jest.mock("../../../../src/game/utils/storyTextProcessor", () => ({
  processStoryText: (text: string) => [{ type: "text", content: text }],
}));

const NOTICE = "[notice about the choices]";

function option(text: string): BeatOption {
  return { optionType: "exploration", resourceType: "normal", text };
}

const arrival: Beat = { ...beat("Arrival"), options: [option("Look around")] };
const crossroads: Beat = {
  ...beat("Crossroads", -1),
  options: [option("Go left"), option("Go right")],
};

/** The beat at an index, with the notice the story view hands it; localSelectedChoice set while a choice is on its way. */
function renderBeat(
  beats: Beat[],
  displayedBeatIndex: number,
  localSelectedChoice?: number,
  overrides: Partial<ClientStoryState> = {}
): string {
  return renderMarkup(
    <BeatContent
      storyState={clientStoryState({ players: { player1: player(beats) }, ...overrides })}
      currentBeat={beats[displayedBeatIndex] ?? null}
      previousBeatIndex={displayedBeatIndex > 0 ? displayedBeatIndex - 1 : null}
      displayedBeatIndex={displayedBeatIndex}
      beatHistory={beats}
      isViewingLatestBeat={displayedBeatIndex === beats.length - 1}
      localSelectedChoice={localSelectedChoice}
      isRequestPending={() => false}
      onChoiceSelected={jest.fn()}
      choiceNotice={NOTICE}
    />
  );
}

describe("BeatContent's notice about the player's choices", () => {
  it("sits right above the latest beat's open choices, after its text and feedback", () => {
    const html = renderBeat([arrival, crossroads], 1);

    expect(html.indexOf(NOTICE)).toBeGreaterThan(html.indexOf("[feedback]"));
    expect(html.indexOf(NOTICE)).toBeLessThan(html.indexOf("Go left"));
  });

  it("stays while the player's choice is on its way and the choices are hidden, so a refusal lands in it", () => {
    const html = renderBeat([arrival, crossroads], 1, 0);

    expect(html).not.toContain("Go left");
    expect(html).toContain(NOTICE);
  });

  it("is not shown on an earlier beat the player looks back at, or on a beat whose choice is in", () => {
    const chosen: Beat = { ...crossroads, choice: 1 };

    expect(renderBeat([arrival, crossroads], 0)).not.toContain(NOTICE);
    expect(renderBeat([arrival, chosen], 1)).not.toContain(NOTICE);
  });

  it("is not shown once the story is over", () => {
    expect(renderBeat([arrival, crossroads], 1, undefined, { gameOver: true })).not.toContain(NOTICE);
  });
});

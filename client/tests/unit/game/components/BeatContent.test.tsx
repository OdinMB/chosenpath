import type { Beat, BeatOption, ClientStoryState } from "core/types";
import { BeatContent } from "../../../../src/game/components/BeatContent";
import { GameSessionContext } from "../../../../src/game/GameSessionContext";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";
import {
  beat,
  clientStoryState,
  gameSession,
} from "../../../helpers/storyFixtures";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// react-markdown is an ES module Jest cannot parse; the beat's text stands as it is
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => children,
}));

const options: BeatOption[] = [
  { optionType: "exploration", resourceType: "normal", text: "Light the lamp" },
  { optionType: "exploration", resourceType: "normal", text: "Walk away" },
];

/** A three-turn story's beats: the ending last, with the options a model may still add to it. */
const BEATS: Beat[] = [
  { ...beat("Arrival", 0), options },
  { ...beat("The Keeper (1/2)", 1), options },
  { ...beat("The Keeper (2/2)", 0), options },
  { ...beat("The End", -1), options },
];

function renderBeat(
  displayedBeatIndex: number,
  overrides: Partial<ClientStoryState> = {}
): string {
  const storyState = clientStoryState({ title: "The Lighthouse", ...overrides });
  return renderMarkup(
    <GameSessionContext.Provider value={gameSession(storyState)}>
      <BeatContent
        storyState={storyState}
        currentBeat={BEATS[displayedBeatIndex] ?? null}
        previousBeatIndex={displayedBeatIndex > 0 ? displayedBeatIndex - 1 : null}
        displayedBeatIndex={displayedBeatIndex}
        beatHistory={BEATS}
        isViewingLatestBeat={displayedBeatIndex === BEATS.length - 1}
        localSelectedChoice={undefined}
        isRequestPending={() => false}
        onChoiceSelected={jest.fn()}
      />
    </GameSessionContext.Provider>
  );
}

const headings = (html: string, tag: "h1" | "h2"): string[] =>
  [...html.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => accessibleText(m[1] ?? ""));

describe("BeatContent at the story's end", () => {
  it("heads the ending with the story's title above 'The End', which stands right over the ending's text", () => {
    const html = renderBeat(3, { gameOver: true });

    expect(headings(html, "h1")).toEqual(["The Lighthouse"]);
    expect(headings(html, "h2")).toEqual(["The End"]);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<h2"));
    expect(html).toMatch(/<\/h2><div class="narrative-container[^"]*" data-ai-generated="true"/);
  });

  it("offers no choices at the ending, even where its beat carries options", () => {
    const text = accessibleText(renderBeat(3, { gameOver: true }));

    expect(text).not.toContain("Light the lamp");
    expect(text).not.toContain("Walk away");
  });

  it("shows the title on the first beat, as it always has, and on no other beat before the end", () => {
    expect(headings(renderBeat(0), "h1")).toEqual(["The Lighthouse"]);
    expect(headings(renderBeat(2), "h1")).toEqual([]);
  });

  it("shows no title on an earlier beat looked back at after the end", () => {
    expect(headings(renderBeat(2, { gameOver: true }), "h1")).toEqual([]);
  });
});

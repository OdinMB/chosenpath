import type { ClientStoryState } from "core/types";
import { CharacterSelection } from "../../../../src/game/components/CharacterSelection";
import { GameSessionContext } from "../../../../src/game/GameSessionContext";
import { notesIn, renderMarkup } from "../../../helpers/staticMarkup";
import {
  clientStoryState,
  gameSession,
  player,
} from "../../../helpers/storyFixtures";

// StoryImage loads its source in an effect; the marker shows the alt text it gets
jest.mock("../../../../src/shared/components/StoryImage", () => ({
  StoryImage: ({ alt }: { alt: string }) => `[image alt: ${alt}]`,
}));

const JOIN =
  "This story is written by an AI system, not a person. Your choices steer what it writes next.";

function selectionState(
  overrides: Partial<ClientStoryState> = {}
): ClientStoryState {
  return clientStoryState({
    characterSelectionCompleted: false,
    players: { player1: player([], -1) },
    characterSelectionIntroduction: {
      title: "Who are you?",
      text: "Pick a character.",
    },
    characterSelectionOptions: {
      player1: {
        outcomes: [],
        possibleCharacterIdentities: [
          {
            name: "Mara",
            pronouns: {
              personal: "she",
              object: "her",
              possessive: "her",
              reflexive: "herself",
            },
            appearance: "A sailor with a red scarf.",
          },
        ],
        possibleCharacterBackgrounds: [
          { title: "Harbour kid", fluffTemplate: "", initialPlayerStatValues: [] },
        ],
      },
    },
    ...overrides,
  });
}

function renderSelection(storyState: ClientStoryState): string {
  return renderMarkup(
    <GameSessionContext.Provider value={gameSession(storyState)}>
      <CharacterSelection onCharacterSelected={jest.fn()} />
    </GameSessionContext.Provider>
  );
}

describe("CharacterSelection", () => {
  it("tells everyone who arrives that an AI system writes the story, before they pick", () => {
    const html = renderSelection(selectionState());

    expect(notesIn(html)).toEqual([
      expect.objectContaining({ name: "AI system", lang: "en", text: JOIN }),
    ]);
    expect(html.indexOf("Identity")).toBeGreaterThan(notesIn(html)[0]!.offset);
  });

  it("labels template portraits as AI-generated in their alt text", () => {
    const html = renderSelection(
      selectionState({ templateId: "template-1", generateImages: true })
    );

    expect(html).toContain("[image alt: AI-generated image: Mara]");
  });
});

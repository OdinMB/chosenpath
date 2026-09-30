import type { ClientStoryState } from "core/types";
import { CharacterSelection } from "../../../../src/game/components/CharacterSelection";
import {
  GameSessionContext,
  type GameSessionContextType,
} from "../../../../src/game/GameSessionContext";
import {
  accessibleText,
  notesIn,
  renderMarkup,
} from "../../../helpers/staticMarkup";
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

function renderSelection(
  storyState: ClientStoryState,
  session: Partial<GameSessionContextType> = {}
): string {
  return renderMarkup(
    <GameSessionContext.Provider
      value={{ ...gameSession(storyState), ...session }}
    >
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

  it("shows a failed selection above the confirm button, which is free to press again", () => {
    const line = "Unable to save your character choice. Please try again.";
    // The selection the server failed on is still marked as running when the failure arrives
    const html = renderSelection(selectionState(), {
      turnFailure: { message: line, at: "[]" },
      isOperationRunning: (type) => type === "select_character",
    });

    const alert = html.indexOf('<div role="alert"');
    expect(alert).toBeGreaterThan(html.indexOf("Background"));
    expect(html.indexOf("Confirm Selection")).toBeGreaterThan(alert);
    expect(accessibleText(html)).toContain(`${line} Try again`);
    expect(html).not.toContain("Processing Character Selection...");
  });

  it("shows no alert while nothing failed", () => {
    expect(renderSelection(selectionState())).not.toContain('role="alert"');
  });
});

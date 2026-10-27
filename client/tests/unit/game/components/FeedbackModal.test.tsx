import type { ReactNode } from "react";
import { FeedbackModal } from "../../../../src/game/components/feedback/FeedbackModal";
import { GameSessionContext } from "../../../../src/game/GameSessionContext";
import { namesByRole, renderMarkup } from "../../../helpers/staticMarkup";
import { clientStoryState, gameSession } from "../../../helpers/storyFixtures";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The modal renders into document.body, which Node has none of: here it renders in place
jest.mock("../../../../src/shared/components/ui/Modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (isOpen ? children : null),
}));

/*
 * Feedback on a part of the story opens with a thumbs-up and a thumbs-down
 * button, icons only: a screen reader names them as the story's own feedback
 * buttons are named. First paint.
 */

function storyBeatModal(): string {
  return renderMarkup(
    <GameSessionContext.Provider value={gameSession(clientStoryState({}))}>
      <FeedbackModal isOpen onClose={() => undefined} mode="story-beat" />
    </GameSessionContext.Provider>
  );
}

describe("FeedbackModal rating buttons", () => {
  it("names the thumbs-up and thumbs-down buttons on a part of the story", () => {
    const names = namesByRole(storyBeatModal(), "button");

    expect(names).toEqual(expect.arrayContaining(["Positive feedback", "Negative feedback"]));
    expect(names.filter((name) => name === "")).toEqual([]);
  });
});

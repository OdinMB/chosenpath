import { PlayerCodes } from "../../../src/page/components/PlayerCodes";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

function renderCodes(codes: Record<string, string>): string {
  return accessibleText(
    renderMarkup(
      <PlayerCodes codes={codes} onCodeSubmit={jest.fn()} storyReady={true} />
    )
  );
}

describe("PlayerCodes", () => {
  describe("a multiplayer story", () => {
    const text = renderCodes({ player1: "ABC123", player2: "DEF456" });

    it("explains what the codes are for", () => {
      expect(text).toContain("Each code is one player's seat in this story.");
      expect(text).toContain(
        "Every player joins on their own device: send them their invite link ( ) or have them enter their code on the home page."
      );
      expect(text).toContain(
        "Their code is also how they get back into the story later."
      );
    });

    it("labels the first seat for a creator who may only be handing out the codes", () => {
      expect(text).toContain("Player 1 (you, if you're playing) ABC123");
      expect(text).toContain("Player 2 DEF456");
      expect(text).not.toContain("(You)");
    });
  });

  it("shows a single player only their own code, without the seat explanation", () => {
    const text = renderCodes({ player1: "ABC123" });

    expect(text).toContain("Your Access Code: ABC123");
    expect(text).not.toContain("seat");
  });
});

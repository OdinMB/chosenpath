import { StorySetupFailed } from "../../../src/page/components/StorySetupFailed";
import { accessibleText, renderMarkup } from "../../helpers/staticMarkup";

const MESSAGE = "We couldn't create this story. Please try again.";

function buttonsIn(html: string): string[] {
  return Array.from(html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g), (match) =>
    accessibleText(match[1] ?? "")
  );
}

describe("StorySetupFailed", () => {
  it("says the story couldn't be created and offers to try again or go back", () => {
    const html = renderMarkup(<StorySetupFailed onRetry={jest.fn()} onBack={jest.fn()} />);

    expect(accessibleText(html)).toContain(MESSAGE);
    expect(buttonsIn(html)).toEqual(["Back", "Try again"]);
    // Announced when it replaces the waiting screen
    expect(html).toMatch(/role="alert"/);
  });
});

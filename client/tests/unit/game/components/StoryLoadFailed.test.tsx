import { isValidElement, type ReactElement, type ReactNode } from "react";
import { StoryLoadFailed } from "../../../../src/game/components/StoryLoadFailed";
import { PrimaryButton } from "../../../../src/shared/components/ui/PrimaryButton";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

const notice = {
  title: "We couldn't open this story",
  message: "Check that the code matches the one you were given.",
};

/** Every element in a tree that is not rendered yet: children and element props (a Notification's message) included. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const props = node.props as Record<string, unknown>;
  return [node, ...Object.values(props).flatMap((value) => elementsIn(value as ReactNode))];
}

function buttonsOf(element: ReactElement): Array<{ label: string; onClick: () => void }> {
  return elementsIn(element)
    .filter((child) => child.type === PrimaryButton)
    .map((button) => {
      const props = button.props as { children: string; onClick: () => void };
      return { label: props.children, onClick: props.onClick };
    });
}

describe("StoryLoadFailed", () => {
  it("says what happened as an alert a screen reader announces, instead of the spinner", () => {
    const html = renderMarkup(
      <StoryLoadFailed notice={notice} onTryAgain={jest.fn()} onGoHome={jest.fn()} />
    );

    expect(html).toMatch(/<div[^>]*role="alert"/);
    expect(html).not.toContain("animate-spin");
    expect(accessibleText(html)).toBe(`${notice.title} ${notice.message} Try again Back to home`);
  });

  it("has no close button: closed, it would leave the player on an empty page", () => {
    const html = renderMarkup(
      <StoryLoadFailed notice={notice} onTryAgain={jest.fn()} onGoHome={jest.fn()} />
    );

    expect(html).not.toContain('aria-label="Close"');
  });

  it("tries again, or goes home, from its buttons", () => {
    const onTryAgain = jest.fn();
    const onGoHome = jest.fn();
    const buttons = buttonsOf(StoryLoadFailed({ notice, onTryAgain, onGoHome }));

    expect(buttons.map((button) => button.label)).toEqual(["Try again", "Back to home"]);
    buttons[0]!.onClick();
    expect(onTryAgain).toHaveBeenCalledTimes(1);
    buttons[1]!.onClick();
    expect(onGoHome).toHaveBeenCalledTimes(1);
  });
});

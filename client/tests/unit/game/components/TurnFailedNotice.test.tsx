import { isValidElement, type ReactElement, type ReactNode } from "react";
import { TurnFailedNotice } from "../../../../src/game/components/TurnFailedNotice";
import { PrimaryButton } from "../../../../src/shared/components/ui/PrimaryButton";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

const TURN_FAILED = "Unable to continue the story. Please try again.";
const failure = { message: TURN_FAILED, at: "[]" };

/** Every element in a tree that is not rendered yet: children and element props (a Notification's message) included. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const props = node.props as Record<string, unknown>;
  return [node, ...Object.values(props).flatMap((value) => elementsIn(value as ReactNode))];
}

describe("TurnFailedNotice", () => {
  it("says what failed, as an alert a screen reader announces, with a way to try again", () => {
    const html = renderMarkup(<TurnFailedNotice failure={failure} onTryAgain={jest.fn()} />);

    expect(html).toMatch(/^<div[^>]*role="alert"/);
    expect(accessibleText(html)).toBe(`Something went wrong ${TURN_FAILED} Try again`);
  });

  it("has no close button: closed, it would leave the player waiting on nothing", () => {
    const html = renderMarkup(<TurnFailedNotice failure={failure} onTryAgain={jest.fn()} />);

    expect(html).not.toContain('aria-label="Close"');
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("tries again when its button is pressed", () => {
    const onTryAgain = jest.fn();
    const buttons = elementsIn(TurnFailedNotice({ failure, onTryAgain })).filter(
      (element) => element.type === PrimaryButton
    );

    expect(buttons).toHaveLength(1);
    (buttons[0]!.props as { onClick: () => void }).onClick();
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });
});

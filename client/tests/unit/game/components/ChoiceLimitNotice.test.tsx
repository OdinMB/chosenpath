import { ChoiceLimitNotice } from "../../../../src/game/components/ChoiceLimitNotice";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

const NOW = 1_700_000_000_000;
const LIVE_REGION = '<div aria-live="polite"';

describe("ChoiceLimitNotice", () => {
  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is an empty polite live region while no choice was refused, so the message is announced when it comes", () => {
    const html = renderMarkup(<ChoiceLimitNotice limit={null} />);

    expect(html).toMatch(new RegExp(`^${LIVE_REGION}[^>]*></div>$`));
  });

  it("says the choice wasn't sent, why, and when the player can choose again, without alarming them", () => {
    const html = renderMarkup(<ChoiceLimitNotice limit={{ until: NOW + 12_000, at: "[]" }} />);

    expect(html.startsWith(LIVE_REGION)).toBe(true);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('<span aria-hidden="true">You can choose again in 12 seconds.</span>');
  });

  it("tells a screen reader once, without reading out every second of the countdown", () => {
    const html = renderMarkup(<ChoiceLimitNotice limit={{ until: NOW + 12_000, at: "[]" }} />);

    expect(accessibleText(html)).toBe(
      "Your choice wasn't sent You're choosing faster than the game allows. You can choose again in a few seconds."
    );
  });

  it("says the player can choose again once the wait is over", () => {
    const html = renderMarkup(<ChoiceLimitNotice limit={{ until: NOW, at: "[]" }} />);

    expect(accessibleText(html)).toBe(
      "Your choice wasn't sent You're choosing faster than the game allows. You can choose again now."
    );
    expect(html).not.toContain('aria-hidden="true"');
  });

  it("has no close button: it goes when the player chooses again", () => {
    const html = renderMarkup(<ChoiceLimitNotice limit={{ until: NOW + 12_000, at: "[]" }} />);

    expect(html).not.toContain("<button");
  });
});

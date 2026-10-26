import { JoinGameForm } from "../../../src/page/components/JoinGameForm";
import { accessibleText, openingTag, renderMarkup } from "../../helpers/staticMarkup";

const NOT_FOUND = "Story code not found. Please check the code and try again.";

function renderForm(
  overrides: Partial<Parameters<typeof JoinGameForm>[0]> = {}
): string {
  return renderMarkup(
    <JoinGameForm
      code=""
      isCodeValid={false}
      isValidating={false}
      validationError={null}
      onCodeChange={jest.fn()}
      onSubmit={jest.fn()}
      {...overrides}
    />
  );
}

const codeInput = (html: string) => openingTag(html, "input", "id", "code");
const joinButton = (html: string) => openingTag(html, "button", "type", "submit");
// The attribute, not a disabled: style class
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

describe("JoinGameForm story code field", () => {
  it("has a label for screen readers, not only the placeholder", () => {
    const html = renderForm();

    expect(openingTag(html, "label", "for", "code")).toContain('class="sr-only"');
    expect(html).toMatch(/<label[^>]*>Story code<\/label>/);
    expect(codeInput(html)).toContain('placeholder="Story code"');
  });

  it("is neither invalid nor described by an error while there is none", () => {
    const html = renderForm({ code: "ABC123", isCodeValid: true });

    expect(codeInput(html)).not.toContain("aria-invalid");
    expect(codeInput(html)).not.toContain("aria-describedby");
    expect(html).not.toContain('role="alert"');
  });

  it("ties an error to the field and announces it", () => {
    const html = renderForm({ code: "ZZZ999", isCodeValid: true, validationError: NOT_FOUND });

    expect(codeInput(html)).toContain('aria-invalid="true"');
    expect(codeInput(html)).toContain('aria-describedby="story-code-error"');
    const error = openingTag(html, "p", "id", "story-code-error");
    expect(error).toContain('role="alert"');
    expect(html.slice(html.indexOf(error) + error.length)).toMatch(
      new RegExp(`^${NOT_FOUND.replace(/\./g, "\\.")}</p>`)
    );
  });
});

describe("JoinGameForm join button", () => {
  it("stays disabled until the code has a story code's format", () => {
    expect(isDisabled(joinButton(renderForm({ code: "ABC" })))).toBe(true);
    expect(isDisabled(joinButton(renderForm({ code: "ABC123", isCodeValid: true })))).toBe(false);
  });

  it("is disabled and says so while the code is being checked", () => {
    const html = renderForm({ code: "ABC123", isCodeValid: true, isValidating: true });

    expect(isDisabled(joinButton(html))).toBe(true);
    expect(isDisabled(codeInput(html))).toBe(true);
    expect(accessibleText(html)).toContain("Joining...");
  });
});

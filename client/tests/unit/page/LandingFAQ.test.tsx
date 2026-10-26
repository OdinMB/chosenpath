import { LandingFAQ, LandingFAQEntry } from "../../../src/page/components/LandingFAQ";
import { accessibleText, attribute, openingTag, renderMarkup } from "../../helpers/staticMarkup";

const ITEMS = [
  { question: "Is it free?", answer: "Yes, during the beta." },
  { question: "Can I play alone?", answer: "Yes, or with friends." },
];

describe("LandingFAQ", () => {
  it("starts with every question collapsed, each naming the hidden answer it opens", () => {
    const html = renderMarkup(<LandingFAQ items={ITEMS} />);

    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((match) => match[0]);
    expect(buttons).toHaveLength(ITEMS.length);
    const answerIds = buttons.map((button) => {
      expect(attribute(button, "aria-expanded")).toBe("false");
      const answerId = attribute(button, "aria-controls") ?? "";
      expect(openingTag(html, "div", "id", answerId)).toMatch(/\shidden=""/);
      return answerId;
    });
    expect(new Set(answerIds).size).toBe(ITEMS.length);
  });
});

describe("LandingFAQEntry", () => {
  function renderEntry(isOpen: boolean): string {
    return renderMarkup(
      <LandingFAQEntry
        item={ITEMS[0]}
        answerId="faq-answer-0"
        isOpen={isOpen}
        showDivider={false}
        onToggle={jest.fn()}
      />
    );
  }

  it("marks an open question expanded and shows its answer", () => {
    const html = renderEntry(true);

    const button = openingTag(html, "button", "aria-controls", "faq-answer-0");
    expect(attribute(button, "aria-expanded")).toBe("true");
    const answer = openingTag(html, "div", "id", "faq-answer-0");
    expect(answer).not.toMatch(/\shidden/);
    expect(accessibleText(html)).toBe("Is it free? Yes, during the beta.");
  });

  it("keeps a closed answer in the page, hidden", () => {
    const html = renderEntry(false);

    expect(attribute(openingTag(html, "button", "aria-controls", "faq-answer-0"), "aria-expanded")).toBe("false");
    expect(openingTag(html, "div", "id", "faq-answer-0")).toMatch(/\shidden=""/);
  });
});

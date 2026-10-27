import { ReflectionQuestionsLossNotice } from "../../../../src/resources/templates/components/ReflectionQuestionsLossNotice";
import { accessibleText, attribute, openingTag, renderMarkup } from "../../../helpers/staticMarkup";

/*
 * Before an author accepts an AI change that drops outcomes holding
 * reflection questions: how many questions go, and on which outcome, by its
 * question.
 */

const LOST = [
  { outcomeId: "shared_bell", question: "Does the bell ring again?", count: 2 },
  { outcomeId: "player2_hideout", question: "Does the hideout hold?", count: 1 },
];

describe("ReflectionQuestionsLossNotice", () => {
  it("says how many reflection questions go, then each outcome's count by its question", () => {
    const html = renderMarkup(
      <ReflectionQuestionsLossNotice id="loss" lead={(count) => `Accepting these outcomes removes ${count}:`} lost={LOST} />
    );

    expect(accessibleText(html)).toBe(
      "Accepting these outcomes removes 3 reflection questions: 2 on “Does the bell ring again?” 1 on “Does the hideout hold?”"
    );
    expect(attribute(openingTag(html, "div", "id", "loss"), "id")).toBe("loss");
  });

  it("shows nothing when no question goes", () => {
    expect(renderMarkup(<ReflectionQuestionsLossNotice id="loss" lead={() => "x"} lost={[]} />)).toBe("");
  });
});

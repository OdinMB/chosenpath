import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { TemplateReflectionOutcome } from "core/types/api";
import { ReflectionQuestionsPanel } from "../../../src/page/components/ReflectionQuestionsPanel";
import { ReflectionQuestionsField } from "../../../src/shared/components/ReflectionQuestionsField";
import { accessibleText, attribute, namesByRole, openingTag, renderMarkup } from "../../helpers/staticMarkup";
import { AUDIENCE_WORDS } from "../../helpers/genericWording";

/*
 * Reflection questions on the several-stories start: a disclosure in the
 * several-stories panel, closed until opened, that says how many questions the
 * stories will show and, opened, gives each outcome the stories play a field
 * of its own, prefilled with the World's.
 */

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../src/config", () =>
  jest.requireActual("../../__mocks__/client/config")
);

const OUTCOMES: TemplateReflectionOutcome[] = [
  { id: "shared_harbour", owner: "shared", question: "Does the harbour reopen?", reflectionQuestions: ["Who paid for it?"] },
  { id: "player1_name", owner: "player1", question: "Does the keeper clear the name?", reflectionQuestions: [] },
  { id: "player2_hideout", owner: "player2", question: "Does the hideout hold?", reflectionQuestions: ["Whom did it keep safe?"] },
];
const QUESTIONS = { shared_harbour: ["Who paid for it?"], player1_name: [], player2_hideout: ["Whom did it keep safe?", ""] };

type Props = Parameters<typeof ReflectionQuestionsPanel>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  status: "ready",
  outcomes: OUTCOMES,
  questions: QUESTIONS,
  open: false,
  onToggle: jest.fn(),
  onChange: jest.fn(),
  ...overrides,
});
const render = (overrides: Partial<Props> = {}) => renderMarkup(<ReflectionQuestionsPanel {...props(overrides)} />);

/** Every element in a tree that is not rendered yet, children and element props included. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const nodeProps = node.props as Record<string, unknown>;
  return [node, ...Object.values(nodeProps).flatMap((value) => elementsIn(value as ReactNode))];
}

describe("ReflectionQuestionsPanel", () => {
  it("is a button that opens the questions, closed at first, saying how many the stories will show", () => {
    const html = render();

    const button = openingTag(html, "button", "aria-controls", "batch-reflection-questions");
    expect(attribute(button, "aria-expanded")).toBe("false");
    expect(namesByRole(html, "button")[0]).toBe("Reflection questions 2 questions for these stories");
    expect(openingTag(html, "div", "id", "batch-reflection-questions")).toMatch(/\shidden=""/);
  });

  it("counts one question in the singular, and says when there are none", () => {
    expect(accessibleText(render({ questions: { shared_harbour: ["Why?"] } }))).toContain("1 question for these stories");
    expect(accessibleText(render({ questions: {} }))).toContain("None for these stories yet");
  });

  it("opened, says once what the questions are for and their limits, then each outcome the stories play, whose it is and its question, with its questions", () => {
    const html = render({ open: true });

    expect(openingTag(html, "div", "id", "batch-reflection-questions")).not.toMatch(/\shidden=""/);
    expect(attribute(openingTag(html, "button", "aria-controls", "batch-reflection-questions"), "aria-expanded")).toBe("true");
    const text = accessibleText(html);
    expect(text).toMatch(/Shared Does the harbour reopen\?[\s\S]*Player 1 Does the keeper clear the name\?[\s\S]*Player 2 Does the hideout hold\?/);
    expect(text).toContain(
      "Shown at the end of each story, under the question they belong to. They start as this World's own. What you change here applies to these stories only. Up to 5 for each question, each up to 300 characters."
    );
    expect(text.match(/Up to 5/g)).toHaveLength(1);
    expect(text.match(/Reflection questions/g)).toHaveLength(1);
    expect(new RegExp(`<textarea[^>]*id="batch-player2_hideout-reflection-0"[^>]*>([^<]*)</textarea>`).exec(html)?.[1]).toBe(
      "Whom did it keep safe?"
    );
  });

  it("names each outcome's questions by whose it is and its question, described by the note above them", () => {
    const html = render({ open: true });
    /** The text of the element with this id. */
    const textOf = (id: string) => accessibleText(new RegExp(`<(\\w+)[^>]*\\sid="${id}"[^>]*>([\\s\\S]*?)</\\1>`).exec(html)?.[2] ?? "");

    const groups = [...html.matchAll(/<div[^>]*role="group"[^>]*>/g)].map(([tag]) => tag);
    expect(groups.map((group) => textOf(attribute(group, "aria-labelledby") ?? ""))).toEqual([
      "Shared Does the harbour reopen?",
      "Player 1 Does the keeper clear the name?",
      "Player 2 Does the hideout hold?",
    ]);
    expect(groups.map((group) => attribute(group, "aria-describedby"))).toEqual(Array(3).fill("batch-reflection-note"));
    expect(textOf("batch-reflection-note")).toContain("Up to 5 for each question, each up to 300 characters.");
  });

  it("passes each outcome's changed questions on by its id, and a press of the button to its toggle", () => {
    const onChange = jest.fn();
    const onToggle = jest.fn();
    const tree = elementsIn(ReflectionQuestionsPanel(props({ open: true, onChange, onToggle })));
    const fields = tree.filter((element) => element.type === ReflectionQuestionsField);

    (fields[1]?.props as { onChange: (questions: string[]) => void }).onChange(["What name now?"]);
    (tree.find((element) => element.type === "button")?.props as { onClick: () => void }).onClick();

    expect(fields).toHaveLength(OUTCOMES.length);
    expect(onChange).toHaveBeenCalledWith("player1_name", ["What name now?"]);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("says so while the World's questions load, with no fields yet", () => {
    const html = render({ status: "loading", open: true });

    expect(accessibleText(html)).toContain("Loading this World's questions");
    expect(html).not.toMatch(/<(input|textarea)/);
  });

  it("says the stories will show the World's own questions when they couldn't be loaded", () => {
    const html = render({ status: "failed", open: true });

    expect(accessibleText(html)).toContain("These stories will show the World's own questions, if it has any.");
    expect(html).not.toMatch(/<(input|textarea)/);
  });

  it("names no audience or group", () => {
    expect(accessibleText(render({ open: true }))).not.toMatch(AUDIENCE_WORDS);
  });
});

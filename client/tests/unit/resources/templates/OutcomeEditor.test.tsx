import type { Outcome } from "core/types";
import { OutcomeEditor } from "../../../../src/resources/templates/components/OutcomeEditor";
import { accessibleText, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The expandable item as it is, keeping the props each render gives it, so a test can press its Save
const mockItemProps: Array<Record<string, unknown>> = [];
jest.mock("../../../../src/shared/components/ExpandableItem", () => {
  const actual = jest.requireActual("../../../../src/shared/components/ExpandableItem");
  const { createElement } = jest.requireActual("react");
  return {
    ExpandableItem: (props: Record<string, unknown>) => {
      mockItemProps.push(props);
      return createElement(actual.ExpandableItem, props);
    },
  };
});

/*
 * The outcome editor's form (first paint, in edit mode): a contested shared
 * outcome shows its three fields with their text and the Contest kind
 * selected, so an author can read and edit what setup round 3's form writes
 * into every competitive template (setup doc B1.11: the editor used to show
 * empty challenge fields and drop edits).
 */

function outcome(possibleResolutions: Outcome["possibleResolutions"]): Outcome {
  return {
    id: "shared_voice",
    question: "Who will speak for the goblins at the Queen's council?",
    possibleResolutions,
    resonance: "Scored by Enclave's Voice|Printers' Voice.",
    intendedNumberOfMilestones: 3,
    milestones: [],
  };
}

const CONTEST = { sideAWins: "The enclave speaks", mixed: "They share the seat", sideBWins: "The printers speak" };

function editing(o: Outcome, shared: boolean, contests = true): string {
  return renderMarkup(
    <OutcomeEditor
      outcome={o}
      index={0}
      editingOutcomes={new Set([o.id])}
      setEditingOutcomes={() => undefined}
      onDelete={() => undefined}
      onUpdate={() => undefined}
      shared={shared}
      contests={contests}
    />
  );
}

const option = (markup: string, value: string) => new RegExp(`<option value="${value}"( selected="")?>`).exec(markup);

describe("OutcomeEditor", () => {
  it("shows a contested shared outcome's sides with their text, the Contest kind selected", () => {
    const markup = editing(outcome(CONTEST), true);
    expect(markup).toContain("Side A wins");
    expect(markup).toContain("Side B wins");
    for (const text of Object.values(CONTEST)) expect(markup).toContain(`value="${text}"`);
    expect(option(markup, "contest")?.[1]).toBe(' selected=""');
    expect(markup).not.toContain(">Favorable<");
  });

  it("offers the Contest kind on a shared challenge outcome", () => {
    const markup = editing(outcome({ favorable: "Reform", mixed: "Some reform", unfavorable: "No reform" }), true);
    expect(option(markup, "challenge")?.[1]).toBe(' selected=""');
    expect(option(markup, "contest")).not.toBeNull();
    expect(markup).toContain('value="Reform"');
  });

  it("offers no Contest kind on a shared outcome in a World without contests (cooperative, or one player), unless it already holds one", () => {
    expect(option(editing(outcome({ favorable: "a", mixed: "b", unfavorable: "c" }), true, false), "contest")).toBeNull();
    const held = editing(outcome(CONTEST), true, false);
    expect(option(held, "contest")?.[1]).toBe(' selected=""');
    expect(held).toContain('value="The enclave speaks"');
  });

  it("offers no Contest kind unless told the World plays contests", () => {
    const markup = renderMarkup(
      <OutcomeEditor
        outcome={outcome({ favorable: "a", mixed: "b", unfavorable: "c" })}
        index={0}
        editingOutcomes={new Set(["shared_voice"])}
        setEditingOutcomes={() => undefined}
        onDelete={() => undefined}
        onUpdate={() => undefined}
        shared
      />
    );
    expect(option(markup, "contest")).toBeNull();
  });

  it("keeps a player's own outcome to challenge and exploration, unless it already holds a contest", () => {
    expect(option(editing(outcome({ favorable: "a", mixed: "b", unfavorable: "c" }), false), "contest")).toBeNull();
    const held = editing(outcome(CONTEST), false);
    expect(option(held, "contest")?.[1]).toBe(' selected=""');
    expect(held).toContain('value="The printers speak"');
  });

  it("shows an exploration outcome's three paths", () => {
    const markup = editing(outcome({ resolution1: "Stays", resolution2: "Leaves", resolution3: "Wanders" }), true);
    expect(option(markup, "exploration")?.[1]).toBe(' selected=""');
    for (const text of ["Stays", "Leaves", "Wanders"]) expect(markup).toContain(`value="${text}"`);
  });
});

/*
 * Reflection questions on an outcome: the author edits them in the outcome's
 * form, and they are saved with the outcome's Save, beside it rather than in
 * it (the World keeps them by outcome id).
 */
describe("OutcomeEditor reflection questions", () => {
  const CHALLENGE = { favorable: "a", mixed: "b", unfavorable: "c" };
  const QUESTIONS = ["Who should speak for the goblins?", "What did the seat cost?"];

  function render(props: Partial<Parameters<typeof OutcomeEditor>[0]> = {}) {
    mockItemProps.length = 0;
    const o = outcome(CHALLENGE);
    const markup = renderMarkup(
      <OutcomeEditor
        outcome={o}
        index={2}
        editingOutcomes={new Set([o.id])}
        setEditingOutcomes={() => undefined}
        onDelete={() => undefined}
        onUpdate={() => undefined}
        shared
        {...props}
      />
    );
    return { markup, item: mockItemProps[mockItemProps.length - 1] ?? {} };
  }

  /** What the text area with this name holds. */
  const textareaText = (markup: string, label: string) =>
    new RegExp(`<textarea[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</textarea>`).exec(markup)?.[1];

  it("shows the outcome's reflection questions in its form, after its resolutions", () => {
    const { markup } = render({ reflectionQuestions: QUESTIONS, onReflectionQuestionsChange: jest.fn() });

    expect(textareaText(markup, "Reflection question 1")).toBe(QUESTIONS[0]);
    expect(textareaText(markup, "Reflection question 2")).toBe(QUESTIONS[1]);
    expect(accessibleText(markup).indexOf("Reflection questions")).toBeGreaterThan(accessibleText(markup).indexOf("Possible Resolutions"));
  });

  it("says on the collapsed outcome how many reflection questions it holds, in the singular for one", () => {
    const collapsed = (questions: string[]) =>
      accessibleText(render({ editingOutcomes: new Set(), reflectionQuestions: questions, onReflectionQuestionsChange: jest.fn() }).markup);

    expect(collapsed(QUESTIONS)).toBe("Who will speak for the goblins at the Queen's council? 2 reflection questions");
    expect(collapsed(QUESTIONS.slice(0, 1))).toContain("1 reflection question");
    expect(collapsed(QUESTIONS.slice(0, 1))).not.toContain("1 reflection questions");
    expect(collapsed([])).not.toContain("reflection question");
  });

  it("offers an outcome without questions the field to add them", () => {
    const { markup } = render({ onReflectionQuestionsChange: jest.fn() });

    expect(accessibleText(markup)).toContain("Reflection questions");
    expect(markup).not.toContain('aria-label="Reflection question 1"');
  });

  it("shows no reflection questions where nothing takes them (the Players tab)", () => {
    const { markup } = render({ reflectionQuestions: QUESTIONS });

    expect(markup).not.toContain("Reflection question");
  });

  it("saves the outcome as an outcome, and its questions, without blank ones, beside it", () => {
    const onUpdate = jest.fn();
    const onReflectionQuestionsChange = jest.fn();
    const { item } = render({ reflectionQuestions: QUESTIONS, onUpdate, onReflectionQuestionsChange });
    const changed = { ...outcome(CHALLENGE), question: "Who speaks now?" };

    (item.onSave as (draft: unknown) => void)({ outcome: changed, reflectionQuestions: [" What changed? ", "", QUESTIONS[1]] });

    expect(onUpdate).toHaveBeenCalledWith(2, changed);
    expect(onReflectionQuestionsChange).toHaveBeenCalledWith(["What changed?", QUESTIONS[1]]);
  });

  it("keeps Save disabled while the outcome has no question, whatever its reflection questions", () => {
    const { item } = render({ reflectionQuestions: QUESTIONS, onReflectionQuestionsChange: jest.fn() });
    const isSaveDisabled = item.isSaveDisabled as (draft: unknown) => boolean;

    expect(isSaveDisabled({ outcome: { ...outcome(CHALLENGE), question: "" }, reflectionQuestions: QUESTIONS })).toBe(true);
    expect(isSaveDisabled({ outcome: outcome(CHALLENGE), reflectionQuestions: [] })).toBe(false);
  });
});

import type { Outcome } from "core/types";
import { OutcomeEditor } from "../../../../src/resources/templates/components/OutcomeEditor";
import { renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);

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

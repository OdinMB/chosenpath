import { isValidElement, type ReactElement, type ReactNode } from "react";
import type { Beat, BeatOption } from "core/types";
import { StoryRecap } from "../../../../src/game/components/StoryRecap";
import { PrimaryButton } from "../../../../src/shared/components/ui/PrimaryButton";
import { accessibleText, openingTag, renderMarkup } from "../../../helpers/staticMarkup";
import { beat } from "../../../helpers/storyFixtures";

const explore = (text: string): BeatOption => ({ optionType: "exploration", resourceType: "normal", text });
const challenge = (text: string, riskType: "safe" | "normal" | "risky", resourceType: "normal" | "sacrifice" = "normal"): BeatOption => ({
  optionType: "challenge",
  resourceType,
  text,
  riskType,
  basePoints: 0,
  modifiersToSuccessRate: [],
});

/** Three turns and the ending: a path chosen, a roll that went well, a sacrifice whose roll went badly. */
const BEATS: Beat[] = [
  { ...beat("Arrival", 1), options: [explore("Take the ferry"), explore("Walk the cliff path")] },
  { ...beat("The Night Market (1/2)", 0), options: [challenge("Haggle with the spice seller", "risky")], resolution: "favorable" },
  {
    ...beat("The Night Market (2/2)", 0),
    options: [challenge("Pay the guard to look away", "safe", "sacrifice")],
    resolution: "unfavorable",
  },
  { ...beat("The End", -1), paidLever: { kind: "sacrifice", group: "player1", stat: "gold", step: -15 } },
];
const STATS = { playerStats: [{ id: "gold", name: "Gold", type: "number" as const }], sharedStats: [] };

type Props = Parameters<typeof StoryRecap>[0];
const props = (overrides: Partial<Props> = {}): Props => ({
  beats: BEATS,
  stats: STATS,
  signedIn: true,
  onLeave: jest.fn(),
  ...overrides,
});

/** Every element in a tree that is not rendered yet, element props included. */
function elementsIn(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!isValidElement(node)) return [];
  const nodeProps = node.props as Record<string, unknown>;
  return [node, ...Object.values(nodeProps).flatMap((value) => elementsIn(value as ReactNode))];
}

/** StoryRecap uses no hooks, so its buttons' handlers can be reached without a DOM. */
function button(recapProps: Props, label: string): () => void {
  const found = elementsIn(StoryRecap(recapProps)).find(
    (element) => element.type === PrimaryButton && accessibleText(renderMarkup(element)) === label
  );
  if (!found) throw new Error(`no button "${label}"`);
  return (found.props as { onClick: () => void }).onClick;
}

/** The markup of each timeline entry, in order, its <li> tag included. */
function entries(html: string): string[] {
  const list = html.match(/<ol[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? "";
  return list.match(/<li[\s>][\s\S]*?<\/li>/g) ?? [];
}

/**
 * What a screen reader reads: accessibleText puts a space at every tag, but
 * inline spans join without one, so punctuation in a span of its own (the
 * visually hidden ": " and ". ") sits against the word before it.
 */
function spoken(html: string): string {
  return accessibleText(html).replace(/\s+([.:])/g, "$1");
}

describe("StoryRecap", () => {
  it("heads the recap 'Your path' for screen readers' heading navigation, naming the section by it", () => {
    const html = renderMarkup(<StoryRecap {...props()} />);

    const section = openingTag(html, "section", "aria-labelledby", "story-recap-title");
    expect(section).not.toBe("");
    expect(html).toMatch(/<h2[^>]*id="story-recap-title"[^>]*>Your path<\/h2>/);
  });

  it("lists the turns in an ordered list, one entry per choice, each headed by its turn and beat", () => {
    const html = renderMarkup(<StoryRecap {...props()} />);

    expect(html).toMatch(/<ol[\s>]/);
    const headings = entries(html).map((entry) => spoken(entry.match(/<h3[^>]*>[\s\S]*?<\/h3>/)?.[0] ?? ""));
    expect(headings).toEqual(["Turn 1: Arrival", "Turn 2: The Night Market (1/2)", "Turn 3: The Night Market (2/2)"]);
  });

  it("says what the player chose on each turn and how it turned out", () => {
    const [first, second, third] = entries(renderMarkup(<StoryRecap {...props()} />)).map(spoken);

    expect(first).toBe("Turn 1: Arrival You chose: Walk the cliff path Result: A choice of direction.");
    expect(second).toBe("Turn 2: The Night Market (1/2) You chose: Haggle with the spice seller Result: Favorable. Risk: High.");
    expect(third).toBe(
      "Turn 3: The Night Market (2/2) You chose: Pay the guard to look away Result: Unfavorable. Risk: Low. Paid with Gold -15."
    );
  });

  it("shows each result with the game's face for it, hidden from screen readers, which read the word", () => {
    const html = renderMarkup(<StoryRecap {...props()} />);

    expect(html).toMatch(/<span aria-hidden="true">😀<\/span>/);
    expect(html).toMatch(/<span aria-hidden="true">🙁<\/span>/);
  });

  it("names a reward the player gained", () => {
    const beats: Beat[] = [
      { ...beat("Contest", 0), options: [challenge("Bet everything", "risky")], resolution: "mixed" },
      { ...beat("The End", -1), paidLever: { kind: "reward", group: "player1", stat: "gold", step: 20 } },
    ];

    expect(spoken(entries(renderMarkup(<StoryRecap {...props({ beats })} />))[0] ?? "")).toBe(
      "Turn 1: Contest You chose: Bet everything Result: Mixed. Risk: High. Gained Gold +20."
    );
  });

  it("leads a signed-in player back to My Stories or home", () => {
    const onLeave = jest.fn();

    button(props({ onLeave }), "My Stories")();
    button(props({ onLeave }), "Home")();

    expect(onLeave.mock.calls).toEqual([["/users/my-stories"], ["/"]]);
  });

  it("leads a player without an account home only: My Stories needs one", () => {
    const onLeave = jest.fn();
    const html = renderMarkup(<StoryRecap {...props({ signedIn: false })} />);

    expect(accessibleText(html)).not.toContain("My Stories");
    button(props({ onLeave, signedIn: false }), "Home")();
    expect(onLeave).toHaveBeenCalledWith("/");
  });
});

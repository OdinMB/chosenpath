import type { PlayerOptionsGeneration, PlayerSlot } from "core/types";
import { StatGroupEditor } from "../../../../src/resources/templates/components/StatGroupEditor";
import { StatListSection } from "../../../../src/resources/templates/components/StatListSection";
import { StoryElementsTab } from "../../../../src/resources/templates/components/StoryElementsTab";
import { OutcomesTab } from "../../../../src/resources/templates/components/OutcomesTab";
import { OutcomePlayer } from "../../../../src/resources/templates/components/PlayerOutcomes";
import { PlayerEditor } from "../../../../src/resources/templates/components/PlayerEditor";
import { namesByRole, renderMarkup } from "../../../helpers/staticMarkup";

// The real config reads import.meta.env, which Jest cannot parse
jest.mock("../../../../src/config", () =>
  jest.requireActual("../../../__mocks__/client/config")
);
// The stat form reads import.meta.env too; a collapsed stat never shows it
jest.mock("../../../../src/resources/templates/components/StatEditor", () => ({
  StatEditor: () => null,
}));
// So does the story element form; an empty list never shows it
jest.mock("../../../../src/resources/templates/components/StoryElementEditor", () => ({
  StoryElementEditor: () => null,
}));
// The player editor's identity and background forms, from the components
// index (which also loads the setup page); a player with none shows neither
jest.mock("../../../../src/resources/templates/components", () => ({
  PlayerIdentityEditor: () => null,
  PlayerBackgroundEditor: () => null,
  ImagePlaceholder: () => null,
}));

/*
 * Each section of the World editor adds an entry with an icon-only "+" button
 * in its header: a screen reader names it for what it adds, and for whom where
 * the section belongs to one player. First paint, with empty sections.
 */

const none = () => undefined;
const noOptions = (): PlayerOptionsGeneration => ({
  outcomes: [],
  possibleCharacterIdentities: [],
  possibleCharacterBackgrounds: [],
});
const playerOptions = {
  player1: noOptions(),
  player2: noOptions(),
  player3: noOptions(),
} as Record<PlayerSlot, PlayerOptionsGeneration>;

describe("World editor add buttons", () => {
  it("names the stat groups' add button", () => {
    const html = renderMarkup(<StatGroupEditor statGroups={[]} onChange={none} />);

    expect(namesByRole(html, "button")).toContain("Add stat group");
  });

  it.each([
    ["shared", "Shared Stats", "Add shared stat"],
    ["player", "Player Stats", "Add player stat"],
  ] as const)("names the %s stats' add button", (type, title, name) => {
    const html = renderMarkup(
      <StatListSection
        title={title}
        tooltip=""
        icon={type}
        iconColor="bg-secondary"
        stats={[]}
        statGroups={["Body"]}
        type={type}
        editingStats={new Set()}
        onAddStat={none}
        onUpdateStat={none}
        onRemoveStat={none}
        onConvertStat={none}
        setEditingStats={none}
      />
    );

    expect(namesByRole(html, "button")).toContain(name);
  });

  it("names the story elements' add button", () => {
    const html = renderMarkup(
      <StoryElementsTab elements={[]} onChange={none} templateId="world-1" showContextCards={false} />
    );

    expect(namesByRole(html, "button")).toContain("Add story element");
  });

  it("names the shared outcomes' add button, and each player's on the Outcomes tab", () => {
    const html = renderMarkup(
      <OutcomesTab
        outcomes={[]}
        onChange={none}
        playerOptions={playerOptions}
        onPlayerOptionsChange={none}
        playerStats={[]}
        showContextCards={false}
      />
    );

    const names = namesByRole(html, "button");
    expect(names).toContain("Add shared outcome");
    expect(names).toEqual(
      expect.arrayContaining(["Add outcome for Player 1", "Add outcome for Player 2", "Add outcome for Player 3"])
    );
  });

  it("names a player's outcome add button in that player's editor", () => {
    const html = renderMarkup(
      <OutcomePlayer
        playerSlot="player2"
        playerOptions={playerOptions}
        editingOutcomes={new Set()}
        setEditingOutcomes={none}
        handleAddPlayerOutcome={none}
        handleCopyOutcome={none}
        handleUpdateOutcome={none}
        handleDeleteOutcome={none}
      />
    );

    expect(namesByRole(html, "button")).toContain("Add outcome for Player 2");
  });

  it("names a player's identity and background add buttons for that player", () => {
    const html = renderMarkup(
      <PlayerEditor
        playerSlot="player2"
        options={noOptions()}
        playerOptions={playerOptions}
        playerStats={[]}
        editingPlayers={new Set(["player2"])}
        editingIdentities={new Set()}
        editingBackgrounds={new Set()}
        editingOutcomes={new Set()}
        setEditingPlayers={none}
        setEditingIdentities={none}
        setEditingBackgrounds={none}
        setEditingOutcomes={none}
        handleAddIdentity={none}
        handleUpdateIdentity={none}
        handleDeleteIdentity={none}
        handleAddBackground={none}
        handleUpdateBackground={none}
        handleDeleteBackground={none}
        handleAddPlayerOutcome={none}
        handleCopyOutcome={none}
        handleUpdateOutcome={none}
        handleDeleteOutcome={none}
        handleSave={none}
        templateId="world-1"
      />
    );

    const names = namesByRole(html, "button");
    expect(names).toEqual(
      expect.arrayContaining([
        "Add identity for Player 2",
        "Add background for Player 2",
        "Add outcome for Player 2",
      ])
    );
  });

  it("leaves no button in these sections without a name", () => {
    const html = [
      renderMarkup(<StatGroupEditor statGroups={[]} onChange={none} />),
      renderMarkup(
        <StoryElementsTab elements={[]} onChange={none} templateId="world-1" showContextCards={false} />
      ),
      renderMarkup(
        <OutcomesTab
          outcomes={[]}
          onChange={none}
          playerOptions={playerOptions}
          onPlayerOptionsChange={none}
          playerStats={[]}
          showContextCards={false}
        />
      ),
    ].join("");

    expect(namesByRole(html, "button").filter((name) => name === "")).toEqual([]);
  });
});

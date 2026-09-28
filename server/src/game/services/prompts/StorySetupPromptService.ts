import type { GameMode } from "core/types/index.js";
import type { PlayerCount } from "core/types/index.js";
import { TemplateIterationSections } from "core/types/admin.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";
import {
  CAMP_SCOREBOARD_LINE,
  CONTESTED_FAVOR,
  GAME_MODES,
  INVENTORY_OUTCOMES,
  KEEP_IDS,
  NO_BLANK_ITEMS,
  ONE_OUTCOME_LIST,
  SCOREBOARD_LINE,
  STORY_ELEMENTS_SECTION,
  WORKED_EXAMPLE,
  engineBlock,
  isContestMode,
  outcomesSection,
  statTypes,
  statsThatAct,
  thisSetupBlock,
} from "./setupPromptText.js";

/*
 * The setup prompt: a new custom story or template from a premise, or AI
 * Iteration on an existing template's sections. The form is setup round 3's
 * as the eval measured it (setupPromptText.ts says what each part is for);
 * the field descriptions and the generation order are setupSchema.ts's.
 * Today's form before the adoption of 2026-09-28 is kept, for the eval only,
 * in storyTextRound0/.
 */

/** A new custom story or template from a premise, or an iteration on an existing template. */
type SetupMode = "story" | "template" | "iteration";

/** What a setup call knows beyond its premise: a child reads along (a read-with-kids story) */
export type SetupPromptOptions = { kids?: boolean };

type SetupCall = {
  players: PlayerCount;
  mode: GameMode;
  kind: SetupMode;
  sections: TemplateIterationSections[];
  maxTurns: number;
  /** A child reads along: the smaller stat budget with plain names. AI Iteration never has it (iteration knows no category). */
  kids: boolean;
};

/** Template fields that identify its creator; they never go to the model. */
const CREATOR_FIELDS = new Set(["creatorId", "creatorUsername"]);

const ALL_SECTIONS = Object.keys(templateIterationSections) as TemplateIterationSections[];

const SEPARATOR = "#".repeat(50);

const asks = (call: SetupCall, ...sections: TemplateIterationSections[]) => sections.some((section) => call.sections.includes(section));
const multiplayer = (call: SetupCall) => call.players > 1;
/** Competitive and cooperative-competitive multiplayer: a contested outcome with its scoreboard */
const contested = (call: SetupCall) => multiplayer(call) && isContestMode(call.mode);
/** Three players with a contest form two camps (contests have two sides) */
const camps = (call: SetupCall) => call.players === 3 && contested(call);
const asksOutcomes = (call: SetupCall) => asks(call, "sharedOutcomes", "players");
const asksStatRules = (call: SetupCall) => asks(call, "stats", "players");
/** The per-call slate speaks about outcomes and stats */
const asksSlate = (call: SetupCall) => asks(call, "sharedOutcomes", "players", "stats");
/** An AI Iteration that regenerates only one of the two outcome lists and keeps the other */
const keepsOneList = (call: SetupCall) => call.kind === "iteration" && asks(call, "sharedOutcomes") !== asks(call, "players");
/** Both outcome lists are written anew: a new setup, or an iteration that regenerates both */
const writesBothLists = (call: SetupCall) => call.kind !== "iteration" || (asks(call, "sharedOutcomes") && asks(call, "players"));

export class StorySetupPromptService {
  /** A new setup from a premise: a custom story (one difficulty level) or a template (3-5). */
  public static createSetupPrompt(
    premise: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    kind: "story" | "template",
    options: SetupPromptOptions = {}
  ): string {
    const call: SetupCall = { players: playerCount, mode: gameMode, kind, sections: ALL_SECTIONS, maxTurns, kids: options.kids ?? false };
    return this.buildPrompt(call, premise, "");
  }

  /** Regenerates the given sections of an existing template from user feedback. */
  public static createIterationPrompt(
    feedback: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number,
    sections: TemplateIterationSections[],
    template: object
  ): string {
    const templateJson = JSON.stringify(Object.fromEntries(Object.entries(template).filter(([key]) => !CREATOR_FIELDS.has(key))));
    const call: SetupCall = { players: playerCount, mode: gameMode, kind: "iteration", sections, maxTurns, kids: false };
    return this.buildPrompt(call, feedback, templateJson);
  }

  private static buildPrompt(call: SetupCall, prompt: string, templateJson: string): string {
    return (
      this.getCreationModeInstructions(call.kind === "iteration") +
      `${engineBlock(camps(call), contested(call))}\n\n` +
      "Guidelines for story setups:\n\n" +
      this.getGuidelinesInstructions(call.sections) +
      this.getInventoryInstructions(call) +
      this.getOutcomesInstructions(call) +
      this.getStoryElementsInstructions(call.sections) +
      this.getStatInstructions(call) +
      `${WORKED_EXAMPLE}\n\n` +
      this.getCharacterSelectionInstructions(call.sections, multiplayer(call)) +
      this.getDifficultyLevelsInstructions(call.sections, call.kind) +
      `${NO_BLANK_ITEMS}\n\n${SEPARATOR}\n\n` +
      this.getConfigurationInstructions(call, prompt, templateJson)
    );
  }

  private static getCreationModeInstructions(iterativeMode: boolean): string {
    if (iterativeMode) {
      return `We already have a setup for an interactive fiction game. Adjust parts of that setup based on user feedback that is provided below. If you don't change an element of the existing story setup or actively want to delete it, assume that it should stay exactly as it is.\n\n`;
    } else {
      return `Create a setup for an interactive fiction game based on a user prompt that is provided below.\n\n`;
    }
  }

  private static getGuidelinesInstructions(sections: TemplateIterationSections[]): string {
    if (sections.includes("guidelines") || sections.includes("players") || sections.includes("storyElements")) {
      return `Inclusivity and diversity
Our goal is two-fold: generate a convincing story, and use this opportunity to defy biases and stereotypes.
We value inclusivity and diverse representation more highly than an 'accurate' or representation of reality or conforming to readers' expectations within fictional worlds.

Specifically:
- The cast of characters should be diverse across the following dimensions: Culture, Race, Gender, Age, Sexual orientation, Disability, etc.
- Characters should defy stereotypes that come with their cultural, racial, gender, etc. identities.
--- Woman are allowed to be dominant, angry, aggressive, strong, visionary, etc.
--- Men are allowed to be sensitive, caring, empathetic, joyful, etc.
--- Black people tend to be in leadership positions, and nations with predomintantly black populations can be dominant world powers.
--- Etc.
- If romance is part of the story, a character's gender should never rule out who they can fall in love with.
- Characters' preferred pronouns are always respected (even in a Wild West story in the 1800s).

Only deviate from this if the story's premise absolutely requires it. For example, if a story is about the struggles of an LGBTQ+ identity, these struggles should of course include stereotypes that come with that identity.

Weave these points into the story setup
- Include them in the guidelines that will define the setting, tone, and structure of the story. Do this in a flavorful way that suits the story. Don't just copy the points above.
- Apply these points to player identities/backgrounds and NPCs

That said: don't overdo it.
- Not every character should be trans/black/disabled/etc.
- The story should still be about the characters and the story, not about their diversity. Diversity should just be a fact of life within the setting.
\n`;
    }
    return "";
  }

  private static getInventoryInstructions(call: SetupCall): string {
    const storyElements = asks(call, "storyElements")
      ? `\n- 6-8 story elements
--- 2-4 NPCs.
--- 2-4 locations
--- 2-4 miscellaneous elements (like items, factions, organizations, dangers, mysteries, conflicts, or whatever the story might need)
--- Add three facts about each story element.
--- Don't include the player characters (main protagonists) in this list.`
      : "";
    const outcomes = asksOutcomes(call) ? INVENTORY_OUTCOMES : "";
    const kids = call.kids;
    const scoreboard = contested(call) ? `\n${camps(call) ? CAMP_SCOREBOARD_LINE : SCOREBOARD_LINE}` : "";
    const stats = asks(call, "stats")
      ? `\n- ${kids ? "Two" : "3-4"} visible shared stats for things that are not directly linked to one player
--- Things that are shared between players (e.g. variables about a group/organization that several players belong to, a spaceship that players use together, a flat that players share, etc.)
--- Stats about the world (e.g. tension between factions, environment conditions, etc.)${scoreboard}${kids ? "" : "\n--- Any invisible shared stats that you think are important"}
- ${kids ? "Two" : "3-4"} visible stats that are directly linked to the player (traits, skills, dispositions, health, personal relationships, personal resources, personal reputation, personal inventory, etc.)${
          kids ? "" : "\n--- Any invisible stats that are linked to that player that you think are important"
        }`
      : "";
    return `Include the following elements:\n${storyElements}${outcomes}${stats}\n\n`;
  }

  private static getOutcomesInstructions(call: SetupCall): string {
    return asksOutcomes(call) ? `${outcomesSection(call.players, contested(call), camps(call))}\n\n` : "";
  }

  private static getStoryElementsInstructions(sections: TemplateIterationSections[]): string {
    return sections.includes("storyElements") ? STORY_ELEMENTS_SECTION : "";
  }

  private static getStatInstructions(call: SetupCall): string {
    if (!asksStatRules(call)) return "";
    return `STATS

Stat groups
are used to group stats in the UI. Both character and shared stats can be grouped and will be displayed in the UI together.
- Group stats in a way that is flavorful and makes sense for the story.
- Use a maximum of 3 different stat groups. Otherwise, the UI will become too crowded and confusing.
- Keep the group names short.
- Examples: Character/Empire/Politics (for building a mafia empire), Detective/City/Contacts (for a mystery story), Character/Ship/Crew (for a space opera)

Stat guidelines
- In general, favor string and string[] stats over numbers and percentages.
--- Exception: countable things whose management is central to the story (gold)
--- Exception: percentages/opposites for aspects that must be managed often and granularly (health, fuel)
- Use the distribution of stats to shape the focus of the story.
--- Example: In a space opera, having three percentage stats for relationships with crew members means that the story will focus heavily on these relationships. If you add a stat 'Crew Morale' (string[]), the focus of the story will be elsewhere.
- Use a variety of stat types.
--- Example for a teenage wizard story: string[] for friends, string for love interest, string[] for mastered spells, string for repuatation at school, percentage for academic performance, and number for pocket money.
- If a stat should be the same for all players, use a shared stat.
--- Example: If the players are all on the same ship, the ship's fuel level is the same for all players.
--- Example: If players maintain a relationship to an NPC as a group, use a shared stat for that relationship. If only one specific player has a relationship with that NPC, use a character stat.
${contested(call) ? `${CONTESTED_FAVOR}\n` : ""}- Use the isVisible attribute to hide stats that the player shouldn't see.
- For player stats, the default partOfPlayerBackgrounds attribute is true. Set to false if a player stat should be the same for all player backgrounds. Examples: Health should be "unscathed" or Status should be "Neonate" at the beginning of the story no matter which background the player chooses.
- The player must immediately know what the stat is for.
--- If you can't convey the stat's meaning and function in the stat's name, don't create that stat.
- Stat names must be specific and mustn't include any placeholders.
--- Bad: 'Relationship with NPC' (Which NPC?)
${statsThatAct(call.players, contested(call))}
${
  multiplayer(call)
    ? "- In multiplayer games, make sure that the backgrounds for different players are consinstent with each other, no matter which backgrounds the players choose.\n" +
      "--- Example: In a space western, only one player should be the pilot. In a band, only one player should be the lead guitarist.\n"
    : ""
}
${statTypes(call.players, contested(call))}\n\n`;
  }

  private static getCharacterSelectionInstructions(sections: TemplateIterationSections[], isMultiplayer: boolean): string {
    if (sections.includes("players")) {
      return `Character Selection Instructions

For the character selection options, make sure that the stats in the different backgrounds are different and balanced.
${
  isMultiplayer
    ? `
multiplayerCoordination:
For this multiplayer game, ensure that the options for identities and backgrounds for each player are meaningfully different from and consistent with each other. Examples:
- Different roles within the group: 'player1 gets different choices for the role of the thief, while player2 gets different choices for the role of the cleric'
- No overlaps in special traits: 'the superpowers of player1 will be around a certain theme, while the superpowers of player2 will be around a different theme'
- No overlaps in personal background details: 'player1 comes from a certain place, while player2 comes from a different place'
Tailor these mechanisms to the setting of the story.
`
    : ``
}
playerStatConversionRates:
- List three conversion rates between player stats to ensure balance.
- Example: '10 points of Village Loyalty are worth 1 level of Adventurer Threat'
- Example: '20% Stage Presence equals one level of Instrument Mastery'
- Example: '50 Followers equals one Special Follower'

backgroundArchetypes:
Outline generic archetypes that the backgrounds could implement and flesh out.
- Consider the player stat conversion rates.
- Each archetype should represent a particular tradeoff between player stats.
- Generic archetypes will be turned into more flavorful backgrounds later.
- Example: 'No starting gold, but high reputation and high loyalty'
- Example: 'High Instrument Mastery, but low Stage Presence'\n\n`;
    } else {
      return "";
    }
  }

  private static getDifficultyLevelsInstructions(sections: TemplateIterationSections[], mode: SetupMode): string {
    if (sections.includes("difficultyLevels")) {
      const isStory = mode === "story";
      return `Difficulty Levels
${
  isStory
    ? `- Define exactly one difficulty level appropriate for the story.
- The difficulty level must have a 'modifier' (number between +20 and -20, in steps of 10) and a 'title' (string).`
    : `- Define 3-5 difficulty levels appropriate for the story.
- Each difficulty level must have a 'modifier' (number between +20 and -20, in steps of 10) and a 'title' (string).`
}
- The title should be a short, flavorful term that summarizes the difficulty level within the story's setting. Example: For a survival story, a modifier of -20 could be titled "Unforgiving". For a lighthearted adventure, +10 could be "Friendly Jaunt".
- +10 means that things tend to go well for the player. 0 means that there are some ups and downs, but things will be OK in the end. -10 features frequent failures, and not all goals will be reached. -20 is playing against the odds, with players typically achieving only a few successes throughout the story.

CRITICAL: Match difficulty range to story type:
- KIDS STORIES / COZY / WHOLESOME / LIGHTHEARTED: Use range from +20 to 0 (easier difficulties)
- BALANCED / ADVENTURE / MYSTERY: Use range from +10 to -10 (standard balanced range)
- HORROR / GRIM / DARK / SURVIVAL: Use range from 0 to -20 (harder difficulties)

${isStory ? "Examples of the levels in each range (pick the one level that fits this story from the matching range):" : "Examples:"}
- A bedtime story about friendly dragons: [+20 "Magical Dreams", +10 "Happy Adventure", 0 "Little Challenge"]
- A detective mystery: [+10 "Amateur Sleuth", 0 "Professional Detective", -10 "Master Case"]
- A horror survival game: [0 "Guardian Angel", -10 "Nightmare", -20 "Doom"]
\n\n`;
    }
    return "";
  }

  /** The per-call block: the game mode, this setup's slate, then the premise (or the template and the feedback). */
  private static getConfigurationInstructions(call: SetupCall, prompt: string, templateJson: string): string {
    const mode = multiplayer(call) ? (GAME_MODES[call.mode as keyof typeof GAME_MODES] ?? "") : "Singleplayer";
    const slate = thisSetupBlock({
      players: call.players,
      mode: call.mode,
      maxTurns: call.maxTurns,
      pointsAtScoreboardRule: asks(call, "stats"),
      writesBothLists: writesBothLists(call),
      kids: call.kids && asksStatRules(call),
    });
    if (call.kind === "iteration") {
      const setupBlock = asksSlate(call) ? `\n${slate}\n` : "";
      const oneList = keepsOneList(call) ? `\n${ONE_OUTCOME_LIST}\n` : "";
      const keepIds = asksSlate(call) ? ` ${KEEP_IDS}` : "";
      return `Your job is to recreate parts of an existing story template based on user feedback. Remember: everything so far has only been general instructions and examples. The pieces of the story setup that you will be creating now must be fully custimized to work for the following specific case.

Here is the original story template:

##############################

Number of players: ${call.players}
Game mode: ${mode}
${setupBlock}
${templateJson}

##############################

Here is the feedback from the user on the existing story template:

<feedback>
${prompt}
</feedback>

You must ONLY regenerate the following sections:
${call.sections.join(", ")}
${oneList}
Maintain consistency with the other parts of the template that you are not changing.${keepIds}

Note that the user can only accept entire sections. If you make changes to the guidelines, provide a fully generated guidelines section. Same for stats, players, etc. Don't just generate additional elements that the user asked for, or make changes to a few specific items. We always need the full, updated sections.`;
    }
    return `Remember: everything so far has only been general instructions and examples. The story setup that you will be creating now must be fully custimized to work for the following prompt:

Number of players: ${call.players}
Game mode: ${mode}

${slate}

<premise>
${prompt}
</premise>`;
  }
}

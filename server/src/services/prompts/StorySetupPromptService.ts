import { type GameMode, GameModes } from "shared/types/story.js";
import type { PlayerCount } from "shared/types/player.js";

const GAME_MODE_DESCRIPTIONS: Record<
  Exclude<GameModes, GameModes.SinglePlayer>,
  string
> = {
  [GameModes.Competitive]:
    "The players in this game are competing against each other. " +
    "The players' outcomes should represent at least one competing goal or interest and no shared goals.",

  [GameModes.Cooperative]:
    "The players in this game are cooperating with each other. " +
    "The players' outcomes should include at least one shared goal or interest that requires collaboration to achieve. " +
    "Individual players may still have personal goals, but these should not conflict with the shared objective.",

  [GameModes.CooperativeCompetitive]:
    "The players in this game have a mix of cooperative and competitive elements. " +
    "Include both shared goals/assets/interests that require collaboration AND individual goals that may put players in competition. " +
    "Players should need to carefully balance helping others versus pursuing their own interests.",
};

export class StorySetupPromptService {
  public static createSetupPrompt(
    prompt: string,
    playerCount: PlayerCount,
    gameMode: GameMode,
    maxTurns: number
  ): string {
    const playerText = playerCount > 1 ? "s" : "";

    return (
      "Create a setup for an interactive fiction game for " +
      playerCount +
      " player" +
      playerText +
      " based on this prompt:\n\n" +
      '"' +
      prompt +
      '".' +
      this.getGameModeInstructions(gameMode) +
      "The entire story is supposed to play out over a course of " +
      maxTurns +
      " beats, " +
      "with each beat consisting of about four paragraphs of text for each player and a decision by the player.\n" +
      "Generate enough conflicts, types of decisions, outcomes, NPCs, and stats to make the story interesting, " +
      "but not so many that they cannot be fully developed within the " +
      maxTurns +
      " beats.\n\n" +
      this.getStatGuidelines()
    );
  }

  private static getStatGuidelines(): string {
    return `This is how a story with 25 beats could look like:
- 3 overarching conflicts
- 3 types of decisions that the players will be able to make
- 6-8 story elements
--- 2-4 NPCs.
--- 2-4 locations
--- 2-4 miscellaneous elements (like items, factions, organizations, dangers, mysteries, conflicts, or whatever the story might need)
--- Add three facts about each story element.
--- Don't include the player characters (main protagonists) in this list.
- In multiplayer games, 0-3 shared outcomes, with a total of 0-6 milestones towards the outcomes' resolution between them
--- Can include outcomes for shared goals/interests (for cooperative and cooperative-competitive games)
--- Can include outcomes for things that players compete over (for competitive and cooperative-competitive games)
- 3-4 visible shared stats for things that are not directly linked to one player
--- Things that are shared between players (e.g. group/organization, a spaceship, a flat)
--- Stats about the world (e.g. tension between factions, industry trends, etc.)
- Any invisible shared stats that you think are important
- Stats for scoring, pacing, and story flags if you think they are needed (if any)
For each player
- (3 - number of shared outcomes) individual outcomes, with a total of (6 - milestones toward shared outcomes) milestones between them
- 3-4 visible stats that are linked directly to that player (traits, skills, dispositions, health, personal relationships, personal resources, etc.)
- Any invisible stats that are linked to that player that you think are important

Outcomes
- In a story with 25 beats, every player should have 3 outcomes as the sum of individual and shared outcomes, with a total of 6 milestones towards these outcomes' resolutions.
--- 1 milestone for side-outcomes
--- 2 milestones as a default
--- 3 milestones for outcomes that are particularly important for the ending.
- Each outcome has 3 possible resolutions.
--- The final resolution will be decided based on the milestones that have been established over the course of the story.
--- Individual and shared cooperative outcomes that have a success/failure structure, the possible resolutions should include one favorable (and/or particularly interesting), one unfavorable (and/or unsatisfactory), and one mixed.
--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed.
--- Exploratory outcomes (= anything other than success/failure and win/lose) can define any 3 possible resolutions. Example: Does Alex choose loyalty to the family or their own ambitions? 1. Loyalty. 2. Ambitions. 3. A mix of both.
- If an outcome is shared, it should not be repeated as an individual outcome.
--- Example: If the shared (competitive) outcome is "Who will reign over the forst?", there should not be any individual outcome like "Will [player] become the new spirit leader?"

Story elements
- For NPCs, include their preferred pronouns and motivations.
- Use the instructions attribute to establish story hints and gameplay mechanics.
--- Example: "Mr. X only helps players in exchange for gold."
--- Example: "If players enter this location, the scene should involve significant danger."
--- Example: "If players enter this location, they restore 10 health."

No franchise copyright infringement!
Don't borrow story elements from established franchises.
- Example: a story about a teenage wizard should not have NPCs named "Luna" or "Dumbledore".
- Example: a space opera should not have story elements from the universes of Star Trek Enterprise or Firefly.

Stat groups
are used to group stats in the UI. Both character and shared stats can be grouped and will be displayed in the UI together.
- Group stats in a way that is flavorful and makes sense for the story.
- Use a maximum of 4 different stat groups. Otherwise, the UI will become too crowded and confusing.
- Keep the group names short.
- Examples: Character/Empire/Politics (for building a mafia empire), Detective/Investigation/Contacts (for a mystery story), Character/Ship/Crew/Resources (for a space opera)

Stat guidelines
- In general, favor string and string[] over numbers
--- Exception: countable things whose management is central to the story (gold)
--- Exception: percentages/opposites for aspects that must be managed often and granularly (health, fuel)
- Use the distribution of stats to shape the focus of the story.
--- Example: In a space opera, having three percentage stats for relationships with crew members means that the story will focus heavily on these relationships. If you add a stat 'Crew Morale' (string[]), the focus of the story will be elsewhere.
- Use a variety of stat types.
--- Example for a teenage wizard story: string[] for friends, string for love interest, string[] for mastered spells, string for repuatation at school, percentage for academic performance, and number for pocket money.
- If players are of the same type (e.g. all are time-traveling spies), use the same character stats for all players.
--- Exception: Stats for relationships or individual side quests can be different for each player.
--- Values for stats should of course be different for each player. This can include lists of items or skills.
- If a stat should be the same for all players, use a shared stat.
--- Example: If the players are all on the same ship, the ship's fuel level is the same for all players.
--- Example: If players maintain a relationship to an NPC as a group, use a shared stat for that relationship. If only one specific player has a relationship with that NPC, use a character stat.
- Use the isVisible attribute to hide stats that the player shouldn't see.
- The player must immediately know what the stat is for.
--- If you can't convey the stat's meaning and function in the stat's name, don't create that stat.
- Stat names must be specific and mustn't include any placeholders.
--- Bad: 'Relationship with NPC' (Which NPC?)
- Don't use stats for things that are covered by other mechanics.
- No direct outcome progress trackers of any kind!! Outcomes are tracked separately.
--- Exmple: If an outcome is "Does [player] find the murderer of [NPC]?" or "Does [player] unravel the mystery about [something]", don't add stats like (percentage) "Investigation progress", (string[]) "Clues", or worst of all (number) "Case Progress".
- Don't track the number of remaining turns or story beats (tracked separately)
- Don't track ordinary player decisions (tracked separately))
- In multiplayer games, aim for a fair initial distribution of stat values. (Above-average values in one stat should be offset by below-average values in another stat.)
- You can use the stat's grouping to shorten the stat name. For example, if a stat belongs to the group 'Relationships', 'Relationship with Mr. Kline' is unnecessarily long. 'Mr. Kline' is enough.

Type of stats and what they are good for:
- string: Qualitative aspects that don't change often, or that don't have to be tracked granularly.
--- Role that can be filled with the name of an NPC (e.g. Assistant, Mentor)
--- Character conditions (e.g., healthy/injured/critical)
--- Relationship states for specific NPCs (e.g., stranger/acquaintance/friend/confidant)
--- Rank (e.g. Private/Corporal/Captain/General)
--- Equipment status (e.g., pristine/worn/damaged/broken)
--- Faction standings (e.g., hostile/neutral/friendly/allied)
--- Emotional states (e.g., calm/agitated/enraged)
--- Level of influence (e.g. Can ask for favors/Can make decisions/Full control)

- string[]: Lists of traits or collectibles
--- Character traits and abilities whose individual level of development are not important for the story (e.g., ["Ambitious", "Empathic", "Spontaneous"] in a romance story, ["Telepathy", "Invisibility"] in a superhero story.)
--- Equipment/inventory (e.g., ["Laser sword", "Med kit"])
--- Role that can be filled with the names of several NPCs (e.g. Friends, Love Interests)
--- Issues (e.g. ["Poisoned", "Bleeding"] if avoiding and dealing with specific ailments is central to the story; otherwise, use a percentage for health)
--- Contacts (e.g., ["Dealers", "Local Newspaper"] if using and building these contacts is central to the story; otherwise, use a string to represent the bredth of contacts)
--- NOT good for tracking progress towards outcomes, as with a list of clues in a mystery story. Don't use a stat for this at all.

- percentage: 0-100. Qualitative aspects that will be changed often and granularly over the course of the story.
--- Resources with a capacity limit (e.g. mana, chi, stamina, fuel, energy, oxygen supply)
--- Integrity statuses (e.g. health, spaceship integrity, mental stability)
--- Skills ONLY IF it's a clearly defined skill and developing the skill is central to the story. ("Magic", "Mystic power", etc. are not clearly defined skills and are often better represented as a string[] of abilities.)
--- Relationship strength with NPCs ONLY IF managing that one specific relationship is central; otherwise, use a string (to track that relationship less granularly) or string[] to allow several relationships to be categorized (as in a list of friends or contacts).
--- Environmental conditions ONLY IF the condition must be managed often and granularly (e.g., radiation levels); otherwise, use a string.

- opposites: Two percentage stats in one. The second stat is always (100 - first stat). As percentages, only use this for qualitative aspects that will be changed often and granularly over the course of the story.
--- Moral alignments (e.g., good|evil, order|chaos, tradition|progress)
--- Competing influences (e.g., science|magic, empire|rebellion)
--- Character dispositions (e.g., cynicism|idealism, logic|empathy)
--- Devices to keep score for competitive, tug-of-war-like outcomes in multiplayer games(e.g., playerA|playerB territory control)

- number: Only for countable quantities
If it cannot be counted, choose another type of stat.
--- Resources without a maximum capacity (e.g., money, ammunition, army size, cult followers)
--- Counters (e.g., wins in a tournament, number of people saved)
--- Countdowns for pacing the story (e.g. days until deadline, remaining seals that protect a powerful artifact)
--- NOT good for skills. Skills aren't countable. Use percentage if the stat is supposed to be developed granularly and changed often, otherwise use a string, or add the skill as an item in a string[].
--- NOT good for power levels (like mystic power). Use string to describe the power level qualitatively or string[] to list specific abilities.
--- NOT good for things that cannot counted, like influence, experience, level of interest, etc.

Options for using the hint attribute for stats effectively:
- For string stats:
--- List all possible values: "Values: Novice/Apprentice/Master/Grandmaster"
--- Explain transitions: "Can only change one step at a time"
--- Define requirements: "Master requires 3 successful rituals"
- For string[] stats:
--- List all possible values: "Values: Lead Singer/Guitarist/Bassist/Drummer/Keyboardist/Vocalist"
--- Alternatively, describe the category: "Only minor spells"
--- Set limitations: "Maximum 5 items can be carried"
- For percentage stats:
--- Specify thresholds: "Below 30% triggers crisis events"
--- Define value meanings: "75%+ considered mastery level"
--- Indicate change rates: "Changes slowly, -5% to +5% per decision"
- For opposites stats:
--- Explain balance implications: "Values below 25% or above 75% unlock extreme options"
--- Define neutral zones: "40-60% represents balanced approach"
- For number stats:
--- Define critical values: "Minimum 5 required for survival"
--- Explain acquisition: "Typically gained 1-3 per successful mission"

Premise: nature spirits guard the forest and compete for followers (cooperative-competitive)
- groups: Spirit/Forest/Following
- character stats:
--- (Spirit) Seasonal powers (string[]). Value: 2 special powers (things like "Protecting crops" or "Healing the sick").
--- (Spirit) Energy (percentage). Value: 100. Hint: Energy is used for manifesting in the world. Regeneration rate: 10% per beat.
--- (Following) Followers (number). Value: 20. Hint: amount of energy a spirit gets when it rests. Determines which spirit has the greatest following at the end of the game.
--- (Following) Special followers (string[]). Value: 2 special followers. Hint: special followers can take action on behalf of the spirit without the spirit having to spend energy to manifest in the world.
- shared stats:
--- (Forest) Threats (string[]). Value: 2 threats. Hint: things like tree-eating bugs, drought, etc.
--- (Forest) Health (percentage). Value: 100. Hint: goes down by 5% per beat per threat that hasn't been removed. Cannot be revived if it ever falls to 0.
--- (Forest) Animal cooperation (percentage). Value: 50. Hint: describes how eager animals are to help the spirits. <40 means that animals become less likely to help the spirits. >60 means that they become more likely.
--- (Forest) Human cooperation (percentage). Value: 50. Hint: describes how eager humans are to help the spirits. <40 means that inhabitants become less likely to help the spirits. >60 means that they become more likely.

Premise: The last rock band on Mars tries to make it while following individual dreams (cooperative-competitive)
- groups: Musician/Ambition/Band
- character stats:
--- (Musician) Stage Presence (percentage). Value: 20-40. Hint: Describes how well the musician is able to perform in front of an audience. Can be developed over time.
--- (Musician) Instrument proficiency (percentage). Value: 20-40. Hint: Describes how well the musician is able to play their instrument. Can be developed over time.
--- (Ambition) Band Loyalty|Solo Ambition (opposites). Value: 30-70. Hint: Describes how much the musician is dedicated to the band or to their solo career. <30 means that the musician gets options for activiely promoting their solo career. >60 means that the musician does not actively explore a solo career for now.
--- (Ambition) [Some personal goal, e.g. "Creating a family", different for each player] (percentage). Value: 0-100. Hint: Describes a personal goal of the musician that makes it hard to focus on the band.
- shared stats:
--- (Band) Gear quality (string). Value: "Worn". Hint: Options: Pristine / Worn / Broken. Gear quality influences the success of gigs.
--- (Band) Fans (number). Value: 150. Hint: Increases by ~10%-20% per gig (depending on the quality). Increases by ~25-100% per album (depending on the quality and if the album hits the taste of Mars).
--- (Band) Sound (string[]). Value: 2 aspects. Hint: can hold max 2 aspects. Describes the sound of the band (e.g. upbeat, sad, nostalgic, etc.). Can be changed to match the taste of Mars.
--- (Band) Trends on Mars (string[]). Value: 2 aspects. Hint: Any aspect of music that is currently popular on Mars (e.g. upbeat, sad, nostalgic, etc.).
`;
  }

  private static getGameModeInstructions(gameMode: GameMode): string {
    return (
      "\n\n" +
      (GAME_MODE_DESCRIPTIONS[
        gameMode as keyof typeof GAME_MODE_DESCRIPTIONS
      ] || "") +
      "\n\n"
    );
  }
}

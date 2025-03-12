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
    const setupPrompt =
      "Create a setup for an interactive fiction game for " +
      playerCount +
      " player" +
      (playerCount > 1 ? "s" : "") +
      " based on this prompt:\n\n" +
      '"' +
      prompt +
      '".' +
      this.getGameModeInstructions(gameMode) +
      this.getStatGuidelines(playerCount > 1);

    console.log("\x1b[36m%s\x1b[0m", setupPrompt);
    return setupPrompt;
  }

  private static getStatGuidelines(isMultiplayer: boolean): string {
    return `Guidelines for the initial story state:
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
--- Examples: If there are 2 shared outcomes with a total of 4 milestones, there should be 1 individual outcome with 2 milestones. If there are 3 shared outcomes with a total of 6 milestones, there should be 0 individual outcomes.
- 3-4 visible stats that are linked directly to that player (traits, skills, dispositions, health, personal relationships, personal resources, etc.)
- Any invisible stats that are linked to that player that you think are important

Outcomes
- Every player should have 3 outcomes as the sum of individual and shared outcomes, with a total of 6 milestones towards these outcomes' resolutions.
--- 1 milestone for side-outcomes
--- 2 milestones as a default
--- 3 milestones for outcomes that are particularly important for the ending.
- Each outcome has 3 possible resolutions.
--- The final resolution will be decided based on the milestones that have been established over the course of the story.
--- Individual and shared cooperative outcomes that have a success/failure structure, the possible resolutions should include one favorable (and/or particularly interesting), one unfavorable (and/or unsatisfactory), and one mixed.
--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed.
--- Exploratory outcomes (= anything other than success/failure and win/lose) can define any 3 possible resolutions. Example: Does Alex choose loyalty to the family or their own ambitions? 1. Loyalty. 2. Ambitions. 3. A mix of both.
${
  isMultiplayer
    ? "- If an outcome is shared, it should not be repeated as an individual outcome.\n" +
      "--- Example: If the shared (competitive) outcome is 'Who will reign over the forst?', there should not be any individual outcome like 'Will [insert player name] become the new spirit leader?'\n"
    : ""
}
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

STATS

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
--- No direct outcome progress trackers of any kind!! Outcomes are tracked separately. Example: If an outcome is "Does [insert player name] find the murderer of [NPC]?" or "Does [insert player name] unravel the mystery about [something]", don't add stats like (percentage) "Investigation progress", (string[]) "Clues", or worst of all (number) "Case Progress".
--- Don't track the number of remaining turns or story beats (tracked separately)
--- Don't track ordinary player decisions (tracked separately)
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
--- NOT good if one stat is clearly more benefitial than the other. Bad: "Stability|Chaos" (if the goal is to preserve stability). "Courage|Fear" (if Fear has no benefits or is not a viable path).

- number: Only for countable quantities
If it cannot be counted, choose another type of stat.
--- Resources without a maximum capacity (e.g., money, ammunition, army size, cult followers)
--- Counters (e.g., wins in a tournament, number of people saved)
--- Countdowns for pacing the story (e.g. days until deadline, remaining seals that protect a powerful artifact)
--- NOT good for skills. Skills aren't countable. Use percentage if the stat is supposed to be developed granularly and changed often, otherwise use a string, or add the skill as an item in a string[].
--- NOT good for power levels (like mystic power). Use string to describe the power level qualitatively or string[] to list specific abilities.
--- NOT good for things that cannot counted, like influence, experience, level of interest, etc.

Context for additional stat parameters
- The story is structured as a series of threads.
- Threads are resolved as favorable/mixed/unfavorable.
- At the end of a thread and depending on the resolution, a milestone is added to the story state. This is what drives the story to its overall resolution.
- Each thread consists of 2-4 beats.
- Each beat is 4-5 paragraphs of text followed by a player decision.
- Beats have a probability distribution for favorable/mixed/unfavorable resolutions.
- This distribution can be influenced by stats.
- It can be shifted in the player's favor by sacrificing something, or in the player's disadvantage by choosing a reward that is going to help the player in other ways later on.
- Favorable resolutions of early beats in a thread improve the chance of favorable resolutions of later beats.
- The last beat of a thread is the most important one, as it decides which milestone is added to the story state.

For each stat, you must define:

Effects on Beat Resolution
Define bonuses and maluses that the stat applies to the chance of success in certain challenges (+/-10 for minor effects, +/-30 for major effects). Be creative. Options include:
- Define conditional bonuses based on context (e.g., "+20 points in forest-based challenges when Forest Health is above 70%")
- Define resource spending mechanics (e.g., "-10/-30 points when the spaceship is Worn/Damaged and required to perform a risky maneuver")

Options (if any) for sacrificing the stat for a higher chance of success in certain beats (expressed in points)
Options (if any) for gaining the stat as a reward for choosing a lower chance of success in certain beats
Must be expressed in the context of individual beats.
Examples:
- "Can spend 20% energy to use a power"
- "Can spend 50 gold to bribe an NPC for +20 points in an interaction challenge"
- "Can find plants in the forest for not focusing fully on the core task at hand"

Narrative Thresholds and Implications.
Define how different values or states of the stat affect the narrative. Be creative. Options include:
- For string stats: Define progression paths and their narrative consequences (e.g., "Master level grants access to the inner sanctum")
- For string[] stats: Define categories and combination effects (e.g., "Categories: Combat/Utility/Healing spells")
- For percentage stats: Define critical thresholds and their effects (e.g., "Below 30% causes visible weakness affecting NPC reactions")
- For opposites stats: Define alignment thresholds and faction effects (e.g., "60%+ Order aligns character with Law faction")
- For number stats: Define wealth/resource thresholds and their social implications (e.g., "1000+ gold represents upper class status")

Adjustment Mechanics
Define how the stat changes based on player choices and thread resolutions (often unfavorable/mixed/favorable). Be creative. Options include:
- Specify changes after different resolution types (e.g., "Increases by 10% after favorable performance thread resolutions")
- Define decay or regeneration patterns (e.g., "Decreases by 5% per thread for each threat")
- For opposites stats, define how choices shift the balance (e.g., "Major moral choices shift value by 5-15%")

These lists are just examples. Feel free to be creative. The important thing is that the stat plays a relevant, plausible, and interesting part in the story.

EXAMPLE STAT SETUPS

Premise: Nature spirits guard the forest and compete for followers (cooperative-competitive)
stat groups: Spirit/Forest/Following
character stats:
- (Spirit) Seasonal powers (string[])
  Value: 2 special powers (things like "Protecting crops" or "Healing the sick").
  Maximum of 3 abilities. 
  Using powers typically provides +30 points to a challenge.
  Each power requires 20% energy to use.
  Learning a third power requires a mixed or favorable resolution of a dedicated thread.
- (Spirit) Energy (percentage).
  Value: 80%.
  Using a power costs 20% energy.
  At 30% or lower, the spirit starts looking weak.
  Regenerate 5% after a resolved thread for each special follower.
- (Following) Followers (number).
  Value: 20.
  Can sometimes alienate/sacrifice 10 followers for a +10-20 bonus in challenges.
  Gain 10/20 followers after a mixed/favorable resolution of a thread that involves followers.
  Gain 5-10 followers as a reward for choosing options that require the spirit to not focus fully on the core task at hand.
  At 100, gain a new special follower.
- (Following) Special followers (string[]).
  Value: 2 special followers (e.g., "Elder Healer", "Warrior Scout").
  Categories: Healers/Warriors/Sages/Artisans.
  Can be risked/sacrificed for +15/30 points in challenges.
  A new special follower can be gained at 100 followers, or through a dedicated thread with a mixed/favorable resolution.
shared stats:
- (Forest) Threats (string[]).
  Value: 2 threats (e.g., "Invasive Blight", "Human Encroachment").
  Each threat creates specific challenges and story opportunities.
  Each active threat applies -10 points to challenges in the forest.
  Unfavorable resolutions of cooperative threads can add a threat.
  Removing threats requires dedicated challenge threads.
- (Forest) Health (percentage).
  Value: 80%.
  At <30%, forest is visibly dying. New threads must focus on Forest Health. At 0%, permanent damage to ecosystem.
  At 70%+, provides +10 points to challenges in the forest.
  Decreases by 5% after each thread for each active forest threat.

Premise: The last rock band on Mars tries to make it while following individual dreams (cooperative-competitive)
stat groups: Musician/Ambition/Band
character stats:
- (Musician) Stage Presence (percentage).
  Value: 30%.
  <30% causes visible nervousness, 50%+ confident performer, 80%+ legendary status.
  Provides (Stage Presence - 50) points to performance challenges.
  Increases after dedicated practice threads and performance threads with mixed (+5%) and favorable (+10%) resolutions.
  Can temporarily boost by 15% through stimulants (with potential negative side effects).
- (Musician) Instrument Mastery (string).
  Value: "Novice".
  Progression: Novice → Amateur → Professional → Virtuoso → Legend.
  Levels provides -20/-10/0/+10/+20 points in performance and recording challenges.
  Advances after threads that involve practice or performing.
- (Ambition) Band Loyalty|Solo Ambition (opposites).
  Value: 40-60.
  <30% unlocks solo career paths, >70% band leadership opportunities.
  Extreme values (>80% or <20%) create tension with bandmates (-10 points in group challenges).
  Shifts 5-15% based on major decisions.
- (Ambition) Personal Dream (name to be adjusted for each player) (string).
  Value: "Beginning" (different for each player).
  Four-stage progression toward personal goal (e.g., "Beginning → Progress → Breakthrough → Fulfillment").
  Advances after dedicated personal threads with mixed/favorable resolutions that the player spends apart from the band.
shared stats:
- (Band) Gear Quality (string).
  Value: "Worn".
  Narrative Thresholds: Broken → Worn → Used → Pristine.
  Performance modifiers: -15 (Broken), -5 (Worn), +5 (Used), +15 (Pristine).
  Degrades one level after major performances.
  Can be upgraded via a dedicated threads (on resource allocation or fixing the gear in some other way).
- (Band) Fans (number).
  Value: 100.
  <100 underground, 500+ media attention, 1000+ major venues, 5000+ Mars-wide fame.
  Can sometimes be alienated to get an "easy out" in a challenge.
  Some fans can sometimes be won by accepting a particularly flashy option with a lower chance of success.
  Increases after successful performances and record publications (+50-200 based on quality).
- (Band) Group Chemistry (percentage).
  Value: 70%.
  Below 40% causes visible tension, above 80% unlocks special group maneuvers in performances.
  Below 40% causes performance penalties (-15 points).
  Affected by individual loyalty/ambition decisions.
`;
  }

  private static getGameModeInstructions(gameMode: GameMode): string {
    return (
      "\n" +
      (GAME_MODE_DESCRIPTIONS[
        gameMode as keyof typeof GAME_MODE_DESCRIPTIONS
      ] || "") +
      "\n\n"
    );
  }
}

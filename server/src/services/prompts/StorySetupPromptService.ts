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
      "--- Example: If the shared (competitive) outcome is 'Who will reign over the forst?', there should not be any individual outcome like 'Will [player name] become the new spirit leader?'\n"
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
--- No direct outcome progress trackers of any kind!! Outcomes are tracked separately. Example: If an outcome is "Does [player name] find the murderer of [NPC]?" or "Does [player name] unravel the mystery about [something]", don't add stats like (percentage) "Investigation progress", (string[]) "Clues", or worst of all (number) "Case Progress".
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

Narrative function for stats
describes how the stat should be used when generating switches, threads, and beats.
- For all stat types
--- Define risk mechanics: "Each use has 10% chance of backfire effect"
- string stats
--- Progression paths: "Progression: Novice → Apprentice → Journeyman → Master → Grandmaster"
--- Contextual benefits: "Master level grants access to the inner sanctum"
--- Social implications: "Outcast status prevents interaction with town merchants"
--- Narrative consequences: "Corrupted status attracts hostile entities"
--- Reputation effects: "Feared status causes NPCs to offer better prices but fewer services"
--- Cultural context: "Noble rank determines speaking order in council meetings"
--- Symbolic meaning: "Blessed status represents divine favor in the narrative"
- For string[] stats:
--- Categories: "Categories: Combat spells/Utility spells/Healing spells"
--- Combination effects: "Combining Fire and Water abilities creates Steam attacks"
- For percentage stats:
--- Critical thresholds: "Critical state below 15% requires immediate attention"
--- Status effects: "90%+ grants temporary immunity to fear effects"
--- Balance consequences: "Extreme values (10% or 90%) attract attention from powerful entities"
--- Risk/reward dynamics: "Higher values enable riskier but more rewarding actions"
- For opposites stats:
--- Faction alignment: "60%+ Order aligns character with Law faction"
--- Power access: "70%+ Chaos grants access to unpredictable but powerful abilities"
--- Social consequences: "Extreme values (80%+) cause social isolation from opposing groups"
--- Environmental interactions: "High Nature value enhances forest abilities, high Technology enhances city abilities"
--- Transformation thresholds: "90%+ triggers physical transformation"
--- Balance benefits: "40-60% range grants access to balanced abilities unavailable at extremes"
--- Narrative voice: "Narrative tone shifts based on dominant alignment"
--- Relationship dynamics: "NPCs of similar alignment are more cooperative"
--- Worldview effects: "Dominant alignment influences available dialogue options"
- For number stats:
--- Economic context: "Average citizen possesses 50-100 coins"
--- Comparative wealth: "1000+ represents upper class status"

Context for game mechanics for stats

Threads, Beats, and Resolution System
- The story is structured around Threads, Beats, and Resolutions that interact with stats:
- Threads are units of 2-4 beats. At the end of a thread, a milestone is added to a story's overall outcome, which moves the story forward.
- Game mechanics are particularly relevant for Challenge threads (cooperative threads with a success/failure structure) and Contest threads (with a sideA vs. sideB structure).
- Resolution depends on the outcomes of individual beats within the thread. More favorable beat resolutions increase the chance of a favorable thread resolution
- Beats are resolved based on the option that the player chose.
- Each option has base points and stat modifiers that affect success chances. Stats directly influence option success through modifiers (typically +/-10 for minor influences, +/-30 for major influences)

Stat Mechanics for Beat Resolution:
When designing stat mechanics, consider how they will affect beat resolutions:
- Percentage stats: Define thresholds that provide bonuses to options (e.g., "Above 70% provides +20 points to social challenge options")
- String stats: Define progression paths that unlock new options or provide bonuses (e.g., "Master rank provides +30 points to related challenge options that involve this skill")
- Number stats: Define resource costs that can be spent for bonuses (e.g., "Can spend 50 gold for +25 points on a challenge option")
- String[] stats: Define combinations or special abilities that provide situational bonuses (e.g., "Having 'Lockpicking' in skills provides +40 points when attempting to break into secured locations")

Stat Changes from Resolutions:
Define how beat and thread resolutions affect stats:
- Specify exact stat changes for different resolution types (e.g., "Favorable resolutions in performance threads increase Stage Presence by 10%")
- Include conditional changes based on thread context (e.g., "Unfavorable resolutions in social threads decrease Reputation by one level")
- Define resource costs and gains tied to different outcomes (e.g., "Mixed resolutions in combat threads cost 20% Health")
- Specify how opposing stats shift based on choices (e.g., "Choosing self-interest options shifts Loyalty|Ambition toward Ambition by 10-15%")

Game mechanics for stats
describes how the stat can be gained, changed, used, and managed. It also describes the effects that the stat has on the chances of success in actions.
- For several stat types:
--- Conditional modifiers: "Effectiveness doubled during full moon phases"
--- Environmental impacts: "Decreases twice as fast in hostile territories"
--- Stress mechanics: "Rapid changes cause penalties to other stats"
- For string[] stats:
--- Limitations: "Maximum 5 items can be carried"
--- Acquisition methods: "New abilities gained only through ancient texts"
--- Exclusivity rules: "Cannot possess both Light and Dark abilities simultaneously"
--- Discovery methods: "A new ability gets unlocked at the end of a thread with a Master NPC with a mixed or favorable resolution"
--- Crafting mechanics: "Can combine basic items to create advanced ones"
- For percentage stats:
--- Usage mechanics: "Consume 20% per successful ritual", "Consume 10% fuel for tactical maneuvers and 30% for traveling to a distant location"
--- Decay mechanics: "Decreases by 5% per beat"
--- Recovery conditions: "Cannot recover above 50% without proper rest"
--- Diminishing returns: "Benefits diminish progressively above 80%"
--- Recovery conditions: "Natural recovery only occurs during rest beats"
--- Balance mechanics: "If above 80%, lose 5% per beat. If below 20%, gain 5% per beat."
- For opposites stats:
--- Pendulum mechanics: "Values naturally drift toward previous extreme by 2% per beat"
--- Inertia mechanics: "Direction of change becomes harder to reverse after 3 consecutive shifts"
--- Resonance mechanics: "Similar alignment as current environment helps in almost all actions (5-10 points). Vice versa for opposing alignment."
--- Explain decision impacts: "Each major moral choice shifts value by 5-15%"
- For number stats:
--- Usage mechanics: "100 gold gives +10 points in a Challenge beat when dealing with an NPC"
--- Milestone rewards: "Mixed milestones on mission threads award 300 units. Favorable ones award 500 units."
--- Resource conversion: "Can be converted to reputation at 10:1 ratio"
--- Earning mechanics: "Base earning rate: 10-20 per beat"
--- Decay mechanics: "Perishable resources decrease by 5% per beat"

EXAMPLE STAT SETUPS

Premise: Nature spirits guard the forest and compete for followers (cooperative-competitive)
- groups: Spirit/Forest/Following
- character stats:
--- (Spirit) Seasonal powers (string[])
    Value: 2 special powers (things like "Protecting crops" or "Healing the sick").
    Mechanics: Maximum of 3 abilities. Using powers provides +20-30 points to challenge options. 
--- (Spirit) Energy (percentage).
    Value: 80%.
    Narrative: At ≤40%, the spirit appears visibly weakened, affecting NPC reactions.
    Mechanics: Regenerate 5% after a resolved thread for each special follower. Using a power costs 20% energy. Below 30%, powers are less effective (-10 points).
--- (Spirit) Harmony|Dominance (opposites).
    Value: 50-50.
    Narrative: Harmony focuses on cooperation with other spirits and creatures, Dominance on control.
    Mechanics: Shifts 5-15% based on decisions. >70% Harmony grants +15 in cooperative threads but -10 in contests. >70% Dominance grants +15 in contests but -10 in cooperative threads.
--- (Following) Followers (number).
    Value: 20.
    Narrative: Determines influence in the forest and ability to affect change.
    Mechanics: Gain 5-10 followers as reward for choosing risky options. At 100, gain a new special follower. Can 'spend' 10 followers for +15 points in challenges.
--- (Following) Special followers (string[]).
    Value: 2 special followers (e.g., "Elder Healer", "Warrior Scout").
    Narrative: Categories: Healers/Warriors/Sages/Artisans. Each provides unique narrative opportunities.
    Mechanics: Each grants 5% energy after resolved threads. Can be risked for +25 points in challenges or permanently sacrificed for +50 points in critical situations.
- shared stats:
--- (Forest) Threats (string[]).
    Value: 2 threats (e.g., "Invasive Blight", "Human Encroachment").
    Narrative: Each threat creates specific challenges and story opportunities.
    Mechanics: Unfavorable resolutions of cooperative threads add a threat. Each threat reduces Forest Health by 5% per thread. Removing threats requires dedicated challenge threads.
--- (Forest) Health (percentage).
    Value: 100%.
    Narrative: Represents the vitality of the shared ecosystem. Affects all spirits' abilities.
    Mechanics: Decreases by 5% per thread for each forest threat. At 70%+, provides +10 points in nature-based challenges. At <30%, threads must focus on forest health. Cannot increase if it falls to 0%.

Premise: The last rock band on Mars tries to make it while following individual dreams (cooperative-competitive)
- groups: Musician/Ambition/Band
- character stats:
--- (Musician) Stage Presence (percentage).
    Value: 30%.
    Narrative: <30% causes visible nervousness, 50%+ confident performer, 80%+ legendary.
    Mechanics: Increases after performance threads with mixed (+5%) and favorable (+10%) resolutions. Can temporarily boost by 15% through stimulants (with potential negative side effects).
--- (Musician) Instrument Mastery (string).
    Value: "Novice".
    Narrative: Progression: Novice → Amateur → Professional → Virtuoso → Legend
    Mechanics: Advances after dedicated practice threads or exceptional performances. Levels provides -20/-10/0/+10/+20 points in performance challenges. "Legend" status unlocks unique song options.
--- (Musician) Signature Techniques (string[]).
    Value: 1 technique (e.g., "Martian Blues Riff", "Zero-G Solo").
    Narrative: Unique playing styles that define the musician's identity.
    Mechanics: Maximum 3 techniques. Each provides +15 points when featured in performances. Combining techniques creates memorable moments that significantly boost fan growth.
--- (Ambition) Band Loyalty|Solo Ambition (opposites).
    Value: 40-60.
    Narrative: <30% unlocks solo career paths, >70% band leadership opportunities.
    Mechanics: Shifts 5-15% based on major decisions. 40-60% provides balanced access to both paths. Extreme values (>80% or <20%) create tension with bandmates.
--- (Ambition) Personal Dream (name to be adjusted for each player) (string).
    Value: "Beginning" (different for each player).
    Narrative: Four-stage progression toward personal goal (e.g., "Beginning → Progress → Breakthrough → Fulfillment").
    Mechanics: Advances after dedicated personal threads. Each stage provides unique narrative opportunities and stat bonuses related to the dream.
- shared stats:
--- (Band) Gear Quality (string).
    Value: "Worn".
    Narrative: Broken → Worn → Used → Pristine. Affects performance quality and venue access.
    Mechanics: Degrades one level after major performances. Can be upgraded through dedicated resource threads. Performance modifiers: -15 (Broken), -5 (Worn), +5 (Used), +15 (Pristine).
--- (Band) Fans (number).
    Value: 100.
    Narrative: <100 underground, 500+ media attention, 1000+ major venues, 5000+ Mars-wide fame.
    Mechanics: Increases after successful performances (+50-200 based on quality). Can be spent (10-50) for special opportunities.
--- (Band) Sound Identity (string[]).
    Value: 2 aspects (e.g., "Retro Synth", "Martian Folk").
    Narrative: Defines the band's unique style and appeal to different audiences.
    Mechanics: Maximum 3 aspects. Changing requires dedicated creative threads. Each match with current Mars trends increases fan gain by 25%.
--- (Band) Mars Music Trends (string[]).
    Value: 2 aspects (e.g., "Neo-Classical", "Dust Metal").
    Narrative: Represents the evolving music scene on Mars.
    Mechanics: One trend changes unpredictably after each resolved thread. Adapting to trends provides bonuses, while deliberately countering trends can create cult followings.
--- (Band) Group Chemistry (percentage).
    Value: 70%.
    Narrative: Represents how well the band works together musically and personally.
    Mechanics: Affected by individual loyalty/ambition decisions. Below 40% causes performance penalties. Above 80% enables special group maneuvers in performances.
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

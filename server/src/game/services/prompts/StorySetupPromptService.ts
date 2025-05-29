import { type GameMode, GameModes } from "core/types/index.js";
import type { PlayerCount } from "core/types/index.js";
import { TemplateIterationSections } from "core/types/admin.js";
import { templateIterationSections } from "core/utils/templateIterationSections.js";

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
    maxTurns: number,
    iterationMode: boolean = false,
    // default: all sections
    sections: TemplateIterationSections[] = Object.keys(
      templateIterationSections
    ) as TemplateIterationSections[],
    templateJson: string = ""
  ): string {
    const setupPrompt =
      this.getCreationModeInstructions(iterationMode) +
      "Guidelines for story setups:\n\n" +
      this.getGuidelinesInstructions(sections) +
      this.getInventoryInstructions(sections, playerCount > 1) +
      this.getOutcomesInstructions(sections, playerCount > 1) +
      this.getStoryElementsInstructions(sections) +
      this.getStatInstructions(sections, playerCount > 1) +
      this.getExampleStatSetups(iterationMode) +
      this.getCharacterSelectionInstructions(sections, playerCount > 1) +
      this.getDifficultyLevelsInstructions(sections) +
      "#".repeat(50) +
      "\n\n" +
      this.getConfigurationInstructions(
        playerCount,
        gameMode,
        prompt,
        iterationMode,
        sections,
        templateJson
      );

    // console.log("\x1b[36m%s\x1b[0m", setupPrompt);
    return setupPrompt;
  }

  private static getCreationModeInstructions(iterativeMode: boolean): string {
    if (iterativeMode) {
      return `We already have a setup for an interactive fiction game. Adjust parts of that setup based on user feedback that is provided below. If you don't change an element of the existing story setup or actively want to delete it, assume that it should stay exactly as it is.\n\n`;
    } else {
      return `Create a setup for an interactive fiction game based on a user prompt that is provided below.\n\n`;
    }
  }

  private static getGuidelinesInstructions(
    sections: TemplateIterationSections[]
  ): string {
    if (
      sections.includes("guidelines") ||
      sections.includes("players") ||
      sections.includes("storyElements")
    ) {
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

  private static getInventoryInstructions(
    sections: TemplateIterationSections[],
    isMultiplayer: boolean
  ): string {
    return `Include the following elements:
${
  sections.includes("storyElements")
    ? `\n- 6-8 story elements
--- 2-4 NPCs.
--- 2-4 locations
--- 2-4 miscellaneous elements (like items, factions, organizations, dangers, mysteries, conflicts, or whatever the story might need)
--- Add three facts about each story element.
--- Don't include the player characters (main protagonists) in this list.`
    : ""
}${
      sections.includes("sharedOutcomes") || sections.includes("players")
        ? `\n- A total of 3 outcomes for each player
--- In multiplayer games, 0-3 shared outcomes, with a total of 0-6 milestones towards the outcomes' resolution between them
    Can include outcomes for shared goals/interests (for cooperative and cooperative-competitive games)
    Can include outcomes for things that players compete over (for competitive and cooperative-competitive games)
--- For each player, (3 - number of shared outcomes) individual outcomes, with a total of (6 - milestones toward shared outcomes) milestones between them
    Examples: If there are 2 shared outcomes with a total of 4 milestones, there should be 1 individual outcome with 2 milestones. If there are 3 shared outcomes with a total of 6 milestones, there should be 0 individual outcomes.`
        : ""
    }${
      sections.includes("stats")
        ? `\n- 3-4 visible shared stats for things that are not directly linked to one player
--- Things that are shared between players (e.g. variables about a group/organization that several players belong to, a spaceship that players use together, a flat that players share, etc.)
--- Stats about the world (e.g. tension between factions, environment conditions, etc.)${
            isMultiplayer
              ? "\n--- Stats to track the score about things that players compete over (e.g. territory control, which side the council/an npc leans towards, etc.)"
              : ""
          }
--- Any invisible shared stats that you think are important
- 3-4 visible stats that are directly linked to the player (traits, skills, dispositions, health, personal relationships, personal resources, personal reputation, personal inventory, etc.)
--- Any invisible stats that are linked to that player that you think are important`
        : ""
    }\n\n`;
  }

  private static getOutcomesInstructions(
    sections: TemplateIterationSections[],
    isMultiplayer: boolean
  ): string {
    if (sections.includes("sharedOutcomes") || sections.includes("players")) {
      if (isMultiplayer) {
        return `Outcomes
- Every player should have 3 outcomes as the sum of individual and shared outcomes, with a total of 6 milestones towards these outcomes' resolutions.
--- 1 milestone for side-outcomes
--- 2 milestones as a default
--- 3 milestones for outcomes that are particularly important for the ending.
- Each outcome has 3 possible resolutions.
--- The final resolution will be decided based on the milestones that have been established over the course of the story.
--- Individual and shared cooperative outcomes that have a success/failure structure, the possible resolutions should include one favorable (and/or particularly interesting), one unfavorable (and/or unsatisfactory), and one mixed.
--- Shared competitive outcomes should include one resolution for side A winning, one for side B winning, and one resolution that is mixed.
--- Exploratory outcomes (= anything other than success/failure and win/lose) can define any 3 possible resolutions. Example: Does Alex choose loyalty to the family or their own ambitions? 1. Loyalty. 2. Ambitions. 3. A mix of both.${
          isMultiplayer
            ? "\n- If an outcome is shared, it should not be repeated as an individual outcome." +
              "\n--- Example: If the shared (competitive) outcome is 'Who will reign over the forst?', there should not be any individual outcome like 'Will [insert player name] become the new spirit leader?'\n"
            : ""
        }\n\n`;
      } // singleplayer
      else {
        return `Outcomes
- The player should have 3 outcomes, with a total of 6 milestones towards these outcomes' resolutions.
--- 1 milestone for side-outcomes
--- 2 milestones as a default
--- 3 milestones for outcomes that are particularly important for the ending.
- Each outcome has 3 possible resolutions.
--- The final resolution will be decided based on the milestones that have been established over the course of the story.
--- For outcomes that have a success/failure structure, the possible resolutions should include one favorable (and/or particularly interesting), one unfavorable (and/or unsatisfactory), and one mixed.\n\n`;
      }
    } else {
      return "";
    }
  }

  private static getStoryElementsInstructions(
    sections: TemplateIterationSections[]
  ): string {
    if (sections.includes("storyElements")) {
      return `Story elements
- For NPCs, include their preferred pronouns and motivations.
- Use the instructions attribute to establish story hints and gameplay mechanics.
--- Example: "Mr. X only helps players in exchange for gold."
--- Example: "If players enter this location, the scene should involve significant danger."
--- Example: "If players enter this location, they restore 10 health."

No franchise copyright infringement!
Don't borrow story elements from established franchises.
- Example: a story about a teenage wizard should not have NPCs named "Luna" or "Dumbledore".
- Example: a space opera should not have story elements from the universes of Star Trek Enterprise or Firefly.\n\n`;
    } else {
      return "";
    }
  }

  private static getStatInstructions(
    sections: TemplateIterationSections[],
    isMultiplayer: boolean
  ): string {
    if (sections.includes("stats") || sections.includes("players")) {
      return `STATS

Stat groups
are used to group stats in the UI. Both character and shared stats can be grouped and will be displayed in the UI together.
- Group stats in a way that is flavorful and makes sense for the story.
- Use a maximum of 3 different stat groups. Otherwise, the UI will become too crowded and confusing.
- Keep the group names short.
- Examples: Character/Empire/Politics (for building a mafia empire), Detective/Investigation/Contacts (for a mystery story), Character/Ship/Crew (for a space opera)

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
- Use the isVisible attribute to hide stats that the player shouldn't see.
- For player stats, the default partOfPlayerBackgrounds attribute is true. Set to false if a player stat should be the same for all player backgrounds. Examples: Health should be "unscathed" or Status should be "Neonate" at the beginning of the story no matter which background the player chooses.
- The player must immediately know what the stat is for.
--- If you can't convey the stat's meaning and function in the stat's name, don't create that stat.
- Stat names must be specific and mustn't include any placeholders.
--- Bad: 'Relationship with NPC' (Which NPC?)
- Don't use stats for things that are covered by other mechanics.
--- Don't track progress toward outcomes (tracked separately via milestones)${
        isMultiplayer
          ? " -- except for contested outcomes in multiplayer games"
          : ""
      }.
--- Don't track the number of remaining turns or story beats (tracked separately)
--- Don't track ordinary player decisions (tracked separately)
${
  isMultiplayer
    ? "- In multiplayer games, make sure that the backgrounds for different players are consinstent with each other, no matter which backgrounds the players choose.\n" +
      "--- Example: In a space western, only one player should be the pilot. In a band, only one player should be the lead guitarist.\n"
    : ""
}
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
--- NOT good for tracking progress towards outcomes. Don't use stats for this at all.

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

- number: Only for countable quantities. If it cannot be counted, choose another type of stat.
--- Resources without a maximum capacity (e.g., money, ammunition, army size, cult followers)
--- Counters (e.g., wins in a tournament, number of people saved)
--- Countdowns for pacing the story (e.g. days until deadline, remaining seals that protect a powerful artifact)
--- NOT good for skills. Skills aren't countable. Use percentage if the stat is supposed to be developed granularly and changed often, otherwise use a string, or add the skill as an item in a string[].
--- NOT good for power levels (like mystic power). Use string to describe the power level qualitatively or string[] to list specific abilities.
--- NOT good for things that cannot counted, like influence, experience, level of interest, etc.
--- NOT good for things that can technically be counted, but that should not just be numbers in a story. Example: 'Goals' and 'Friends' should be represented differently and with more nuance.

Context for additional stat parameters
- The story is structured as a series of threads.
- Threads are resolved as favorable/mixed/unfavorable.
- At the end of a thread and depending on the resolution, a milestone is added to the story state. This is what drives the story to its overall resolution.
- Each thread consists of 2-4 beats.
- Each beat is 5-6 paragraphs of text (4-5 sentences each) followed by a player decision.
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
- "Can spend 50 gold to bribe an NPC in an interaction challenge"
- "Can find plants in the forest for not focusing fully on the core task at hand"

Narrative Thresholds and Implications.
Define how different values or states of the stat affect the narrative. Be creative. Options include:
- For string stats: Define progression paths and their narrative consequences (e.g., "Master level grants access to the inner sanctum")
- For string[] stats: Define categories and combination effects (e.g., "Categories: Combat/Utility/Healing spells")
- For percentage stats: Define critical thresholds and their effects (e.g., "Below 30% causes visible weakness affecting NPC reactions")
- For opposites stats: Define alignment thresholds and faction effects (e.g., "60%+ Order aligns character with Law faction")
- For number stats: Define wealth/resource thresholds and their social implications (e.g., "1000+ gold represents upper class status")

Adjustments after threads
Define how the stat changes based on player choices and thread resolutions (often unfavorable/mixed/favorable). Be creative. Options include:
- Specify changes after different resolution types (e.g., "Increases by 10% after favorable performance thread resolutions")
- Define decay or regeneration patterns (e.g., "Decreases by 5% per thread for each threat")
- For opposites stats, define how choices shift the balance (e.g., "Major moral choices shift value by 5-15%")

Can be changed in beat resolutions
Define if the stat can be changed in beat resolutions.
- If true, small changes can be made to the stat at any point in the story, not just after threads are resolved. Good for stats that are tracked often and granularly.
- If false, the stat can only be changed after threads are resolved. Good for stats where a change would be very noticeable and/or have a long-term effect. This should only happen after a relevant thread is resolved.

These lists are just examples. Feel free to be creative. The important thing is that the stat plays a relevant, plausible, and interesting part in the story.\n\n`;
    } else {
      return "";
    }
  }

  private static getExampleStatSetups(iterationMode: boolean): string {
    if (!iterationMode) {
      return `EXAMPLE STAT SETUPS

Premise: Nature spirits guard the forest and compete for followers (cooperative-competitive)
player stats:
- Seasonal Powers (string[])
  id: player_powers
  possibleValues: "Nature abilities (max 3)"
  effectOnPoints: [
    "+30 points when using a specific power in a challenge directly related to that power",
    "+15 points in challenges within the spirit's seasonal domain",
    "-10 points when attempting to use powers outside the spirit's natural affinity"
  ]
  optionsToSacrifice: "Can spend 20% energy to use a power for +30 points in a relevant challenge"
  optionsToGainAsReward: "None"
  narrativeImplications: [
    "Each power grants access to specific story opportunities and NPC interactions",
    "Having 3 powers marks the spirit as exceptionally versatile among their peers",
    "Powers from opposing seasons create internal conflict reflected in dialogue"
  ]
  adjustmentsAfterThreads: [
    "Can gain a new power after a favorable resolution of a thread focused on spiritual growth",
    "Powers may temporarily weaken (-10 points effectiveness) after an unfavorable resolution in a thread where they were heavily relied upon",
    "Powers can evolve to more potent versions after repeated successful use in critical moments"
  ]
  canBeChangedInBeatResolutions: false (seasonal powers require dedicated threads to evolve)
  Initial values in player backgrounds: 1-2 powers around a seasonal theme, e.g. ["Healing Aura", "Plant Growth"] (balance with other player stats)

- Energy (percentage)
  id: player_energy
  effectOnPoints: [
    "Below 30% applies -15 points when interacting with human NPCs due to visible weakness",
    "50-80% provides no modifier to challenges",
    "Above 80% provides +10 points to challenges involving spiritual influence"
  ]
  optionsToSacrifice: "Can spend 20% energy to use a Seasonal Power or 30% energy for a +20 point boost in any spiritual challenge"
  optionsToGainAsReward: "Can choose to rest and recover energy instead of pursuing immediate goals"
  narrativeImplications: [
    "Below 30% causes the spirit to appear faded and translucent to NPCs",
    "Above 80% causes the spirit to radiate visibly, impressing mortal NPCs"
  ]
  adjustmentsAfterThreads: [
    "Regenerates 5% after each thread resolution for each special follower in your following",
    "Decreases by 10% after unfavorable resolutions in threads involving intense spiritual activity",
    "Can be fully restored after a favorable resolution in a thread focused on spiritual renewal"
  ]
  canBeChangedInBeatResolutions: true (energy can fluctuate in a single beat)
  Initial values in player backgrounds: 40-80 (balance with other player stats)
  
- Followers (number)
  id: player_followers_count
  effectOnPoints: [
    "+1 point for every 10 followers in social influence challenges",
    "+15 points in challenges where followers can directly assist (maximum +30)",
    "-10 points in stealth challenges for each 20 followers due to increased visibility"
  ]
  optionsToSacrifice: "Can risk 10 followers (potentially losing them) for a +20 bonus in critical challenges"
  optionsToGainAsReward: "Can gain 5-10 followers by choosing to perform public demonstrations of power instead of more discreet actions"
  narrativeImplications: [
    "Below 10 followers marks the spirit as struggling and vulnerable",
    "50+ followers grants recognition among other spirits",
    "100+ followers allows establishing a formal shrine with permanent benefits"
  ]
  adjustmentsAfterThreads: [
    "Gain 10/20 followers after mixed/favorable resolution of a thread involving public displays of power",
    "Lose 5-15 followers after unfavorable resolutions where the spirit appears weak"
  ]
  canBeChangedInBeatResolutions: true (followers can be gained or lost in a single beat)
  Initial values in player backgrounds: 20-50 (balance with other player stats)

- Special followers (string[])
  id: player_special_followers
  possibleValues: "Healers/Warriors/Sages/Artisans (max 4)"
  effectOnPoints: [
    "+15 points in challenges where a special follower's expertise directly applies",
    "+10 points in social challenges with NPCs from the same profession as your special followers",
    "Combinations of complementary followers (e.g., Sage + Artisan) can provide bonsues for creative problem-solving"
  ]
  optionsToSacrifice: "Can send a special follower on a dangerous mission for a +30 bonus, risking their permanent loss"
  optionsToGainAsReward: "Can recruit a special follower by choosing to help a skilled individual instead of pursuing the main objective"
  narrativeImplications: [
    "Each special follower unlocks unique dialogue options and quest opportunities",
    "Having followers from all four categories grants the 'Balanced Circle' status, respected by all factions",
    "Special followers may develop their own storylines and conflicts requiring resolution"
  ]
  adjustmentsAfterThreads: [
    "Can gain a new special follower at 100 regular followers or through a dedicated recruitment thread",
    "Special followers may leave after consecutive unfavorable thread resolutions",
    "Special followers can evolve to more powerful versions after contributing to favorable thread resolutions"
  ]
  canBeChangedInBeatResolutions: false (special followers are too important to be lost or added within a single beat, except through sacrifices or reward options)
  Initial values in player backgrounds: 1-3 special followers, e.g. ["Elder Healer", "Warrior Scout"] (balance with other player stats)

shared stats:
- Threats (string[])
  id: shared_forest_threats
  possibleValues: "Environmental/Human/Spiritual threats"
  effectOnPoints: [
    "Each active threat applies -10 points to all challenges in the affected forest regions",
    "Threats matching a spirit's seasonal weakness apply an additional -10 points to that spirit",
    "+15 points in challenges directly addressing a specific threat"
  ]
  optionsToSacrifice: "None"
  optionsToGainAsReward: "None"
  narrativeImplications: [
    "Each threat creates specific environmental descriptions and NPC reactions",
    "Multiple threats of the same category (e.g., two Human threats) intensify their narrative impact",
    "Unaddressed threats escalate over time, changing their description and increasing their penalties"
  ]
  adjustmentsAfterThreads: [
    "New threats may appear after unfavorable resolutions of cooperative threads",
    "Threats can be removed through dedicated challenge threads with favorable resolutions",
    "Threats may evolve or combine if multiple remain unaddressed for several threads"
  ]
  canBeChangedInBeatResolutions: false (forest threats are too big to be solved or added within a single beat)
  Initial value: ["Invasive Blight", "Human Encroachment"]

- Health (percentage)
  id: shared_forest_health
  effectOnPoints: [
    "Below 30% applies -20 points to all nature-based challenges due to dying ecosystem",
    "30-70% provides no modifier to challenges",
    "Above 70% provides +15 points to all nature-based challenges and +10 to all other challenges in the forest"
  ]
  optionsToSacrifice: "Can channel forest health (reducing it by 10%) for a +25 bonus in critical challenges"
  optionsToGainAsReward: "Can focus on forest restoration instead of pursuing immediate goals"
  narrativeImplications: [
    "Below 30% causes visible withering, affecting all descriptions and NPC reactions",
    "At 0%, permanent damage occurs, changing the nature of available challenges",
    "Above 90% creates a vibrant, almost magical atmosphere that impresses visitors"
  ]
  adjustmentsAfterThreads: [
    "Decreases by 5% after each thread for each active forest threat",
    "Increases by 20% after favorable resolutions in threads focused on healing the forest",
    "Can be permanently reduced by certain unfavorable thread resolutions"
  ]
  canBeChangedInBeatResolutions: true (forest health can fluctuate a little in a single beat)
  Initial value: 80

##########

Premise: The last rock band on Mars tries to make it while following individual dreams (cooperative-competitive)
player stats:
- Stage Presence (percentage)
  id: player_stage_presence
  effectOnPoints: [
    "Provides (Stage Presence - 50) points to performance challenges (negative at low values, positive at high values)",
    "+20 points in social challenges with fans when above 70%",
    "-15 points in precision-based musical challenges when above 80% due to showboating tendencies"
  ]
  optionsToSacrifice: "Can push limits for a temporary +20 boost in a beat for a permanent -5% Stage Presence after the challenge"
  optionsToGainAsReward: "Can choose riskier, more flamboyant performance options that might fail but build presence if successful"
  narrativeImplications: [
    "Below 30% causes visible nervousness affecting all performance descriptions",
    "50-80% represents confident, engaging performances that satisfy audiences",
    "Above 80% creates legendary moments that become part of Mars music history"
  ]
  adjustmentsAfterThreads: [
    "Increases by 10% after mixed resolutions in performance threads",
    "Increases by 20% after favorable resolutions in performance threads",
    "Decreases by 5-10% after public failures or embarrassments"
  ]
  canBeChangedInBeatResolutions: false (stage presence should only be changed after a thread is resolved, except for sacrifice and reward options)
  Initial values in player backgrounds: 20-60 (balance with instrument mastery)

- Instrument Mastery (string)
  id: player_instrument_mastery
  possibleValues: "Novice → Amateur → Professional → Virtuoso → Legend"
  effectOnPoints: [
    "Provides -20/-10/0/+10/+20 points in performance and recording challenges based on level",
    "+15 points in challenges involving musicians of the same or lower mastery level",
    "-10 points in challenges involving musicians of higher mastery levels"
  ]
  optionsToSacrifice: "None"
  optionsToGainAsReward: "None"
  narrativeImplications: [
    "Each level unlocks new performance techniques and composition options",
    "Professional level required for mainstream venue acceptance",
    "Legend status attracts collaboration offers from famous Martian artists"
  ]
  adjustmentsAfterThreads: [
    "Advances one level after favorable resolutions in threads focused on practice or performance",
    "Virtuoso and Legend levels require dedicated mastery threads with favorable resolutions"
  ]
  canBeChangedInBeatResolutions: false (same as stage presence)
  Initial values in player backgrounds: Novice/Amateur/Professional (balance with stage presence)

- Band Loyalty|Solo Ambition (opposites)
  id: player_loyalty_ambition
  effectOnPoints: [
    "Band Loyalty >70% provides +15 points in collaborative challenges but -10 in solo opportunities",
    "Solo Ambition >70% provides +15 points in individual challenges but -10 in group performances",
    "Values between 40-60 provide +5 points in both collaborative and solo challenges due to balanced approach"
  ]
  optionsToSacrifice: "None"
  optionsToGainAsReward: "None"
  narrativeImplications: [
    "Below 30% Band Loyalty unlocks solo career opportunities and tensions with bandmates",
    "Above 70% Band Loyalty enables leadership positions and deeper band relationships",
    "Extreme values (>80% or <20%) create significant narrative consequences in band dynamics"
  ]
  adjustmentsAfterThreads: [
    "Shifts 5-15% toward Solo Ambition after favorable resolutions in personal achievement threads",
    "Shifts 5-15% toward Band Loyalty after favorable resolutions in collaborative threads",
    "Major decisions in critical moments can cause shifts of up to 20%"
  ]
  canBeChangedInBeatResolutions: false (should be decided by threads, not as random adjustments in single beats)
  Initial value: 50 (no variation)


- Personal Dream (string)
  id: player_personal_dream
  possibleValues: "Beginning → Progress → Breakthrough → Fulfillment"
  effectOnPoints: [
    "Starting at Breakthrough level: -10 to performances (not fully motivated anymore)",
    "+5/+10/+15/+20 points in creative challenges based on dream progression level",
    "-5 points in challenges that conflict with your dream's direction"
  ]
  optionsToSacrifice: "Can temporarily set aside personal dream pursuits to focus on band needs"
  optionsToGainAsReward: "Can choose options that advance personal goals at the cost of immediate band success"
  narrativeImplications: [
    "Each stage unlocks new personal storylines and opportunities",
    "Breakthrough stage attracts attention from influential industry figures",
    "Fulfillment affects the character's endgame options and satisfaction"
  ]
  adjustmentsAfterThreads: [
    "Advances one stage after favorable resolutions in threads focused on personal development",
    "Final stage requires a dedicated culmination thread with favorable resolution"
  ]
  canBeChangedInBeatResolutions: false (requires dedicated threads to evolve)
  Initial value: "Beginning" (no variation)

shared stats:
- Gear Quality (string)
  id: shared_gear_quality
  possibleValues: "Broken → Worn → Used → Pristine"
  effectOnPoints: [
    "Provides -15 (Broken), -5 (Worn), +5 (Used), or +15 (Pristine) points to all performance and recording challenges",
    "Broken gear creates -20 points in professional venue challenges due to credibility loss",
    "Pristine gear provides +10 points in impression challenges with industry professionals"
  ]
  optionsToSacrifice: "Can push equipment beyond limits"
  optionsToGainAsReward: "Can choose to maintain or upgrade equipment instead of pursuing immediate opportunities"
  narrativeImplications: [
    "Gear quality affects all performance descriptions and audience reactions",
    "Broken gear prevents access to professional venues and recording opportunities",
    "Pristine gear attracts attention from tech sponsors and collectors"
  ]
  adjustmentsAfterThreads: [
    "Degrades one level after major performances",
    "Can improve one level after favorable resolutions in threads focused on equipment acquisition or repair",
    "Extreme performance conditions (dust storms, temperature) may cause unexpected degradation"
  ]
  canBeChangedInBeatResolutions: false (as a percentage stat, it could be changed in a single beat, but as a 4-stage string stat, it should only be changed after a thread is resolved or through sacrifices and rewards)
  Initial value: "Worn"

- Fans (number)
  id: shared_fan_count
  effectOnPoints: [
    "+1 point for every 100 fans in performance challenges (maximum +20)",
    "+15 points in social media challenges when above 500 fans",
    "-10 points in underground venue challenges when above 1000 fans due to 'selling out' perception"
  ]
  optionsToSacrifice: "Can alienate 50-100 fans for bonuses in artistic integrity challenges"
  optionsToGainAsReward: "Can choose crowd-pleasing options over artistic expression to gain 50 fans"
  narrativeImplications: [
    "Below 100 fans represents underground status with cult following",
    "500+ fans attracts media attention and mid-tier venue access",
    "5000+ fans represents Mars-wide fame with major commercial opportunities"
  ]
  adjustmentsAfterThreads: [
    "Increases by 50-200 after favorable resolutions in performance threads",
    "Decreases by 50-100 after unfavorable resolutions that disappoint audiences"
  ]
  canBeChangedInBeatResolutions: true (some fans can be gained or lost in a single beat)
  Initial value: 100

- Group Chemistry (percentage)
  id: shared_group_chemistry
  effectOnPoints: [
    "Below 40% applies -15 points to all collaborative challenges due to visible tension",
    "40-70% provides no modifier to challenges",
    "Above 70% provides +10 points to collaborative challenges, increasing to +20 above 90%"
  ]
  optionsToSacrifice: "Can cover up disagreements temporarily to get through a challenge (losing 5% Chemistry permenently)"
  optionsToGainAsReward: "Can choose band bonding activities over immediate career opportunities (for a 5% Chemistry gain)"
  narrativeImplications: [
    "Below 40% creates visible tension in all band interactions and performances",
    "Above 80% unlocks special collaborative techniques and musical innovations",
    "Chemistry level affects all inter-band dialogue and decision options"
  ]
  adjustmentsAfterThreads: [
    "Increases by 5-10% after favorable resolutions in collaborative threads",
    "Decreases by 5-15% after conflicts or when individual ambitions are prioritized",
    "Affected by the average Band Loyalty|Solo Ambition balance across all players"
  ]
  canBeChangedInBeatResolutions: true (group chemistry can fluctuate a little in a single beat)
  Initial value: 70\n\n`;
    } else {
      return "";
    }
  }

  private static getCharacterSelectionInstructions(
    sections: TemplateIterationSections[],
    isMultiplayer: boolean
  ): string {
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

playerBackgroundVariety:
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

  private static getDifficultyLevelsInstructions(
    sections: TemplateIterationSections[]
  ): string {
    if (sections.includes("difficultyLevels")) {
      return `Difficulty Levels
- Define 3 difficulty levels appropriate for the story.
- Each difficulty level must have a 'modifier' (number between +20 and -30, in steps of 10) and a 'title' (string).
- The title should be a short, flavorful term that summarizes the difficulty level within the story's setting. Example: For a survival story, a modifier of -20 could be titled "Unforgiving". For a lighthearted adventure, +10 could be "Friendly Jaunt".
- +10 means that things tend to go well for the player. 0 means that there are some ups and downs, but things will be OK in the end. -10 features frequent failures, and not all goals will be reached. -20 is playing against the odds, with players typically achieving only a few successes throughout the story. -30 only works if failures are at the core of the story.
\n\n`;
    }
    return "";
  }

  private static getConfigurationInstructions(
    playerCount: number,
    gameMode: GameMode,
    prompt: string,
    iterationMode: boolean,
    sections: TemplateIterationSections[],
    templateJson: string
  ): string {
    if (iterationMode) {
      return `Your job is to recreate parts of an existing story template based on user feedback. Remember: everything so far has only been general instructions and examples. The pieces of the story setup that you will be creating now must be fully custimized to work for the following specific case.

Here is the original story template:

##############################

Game mode: ${this.getGameModeInstructions(gameMode, playerCount > 1)}

${templateJson}

##############################

Here is the feedback from the user on the existing story template:

${prompt.toUpperCase()}

You must ONLY regenerate the following sections:
${sections.join(", ")}

Maintain consistency with the other parts of the template that you are not changing.

Note that the user can only accept entire sections. If you make changes to the guidelines, provide a fully generated guidelines section. Same for stats, players, etc. Don't just generate additional elements that the user asked for, or make changes to a few specific items. We always need the full, updated sections.`;
    } else {
      return `Remember: everything so far has only been general instructions and examples. The story setup that you will be creating now must be fully custimized to work for the following prompt:

Number of players: ${playerCount}
Game mode: ${this.getGameModeInstructions(gameMode, playerCount > 1)}

${prompt.toUpperCase()}`;
    }
  }

  private static getGameModeInstructions(
    gameMode: GameMode,
    isMultiplayer: boolean
  ): string {
    if (isMultiplayer) {
      return (
        GAME_MODE_DESCRIPTIONS[
          gameMode as keyof typeof GAME_MODE_DESCRIPTIONS
        ] || ""
      );
    } else {
      return "Singleplayer";
    }
  }
}

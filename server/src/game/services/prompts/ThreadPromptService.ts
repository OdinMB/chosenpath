import { Story } from "core/models/Story.js";
import {
  StoryStatePromptService,
  type SectionConfig,
} from "./StoryStatePromptService.js";
import { pickedOutcome, threadPacingBlock } from "../pacing.js";

/*
 * The chapter planner (planner v2 with two-sided contests, adopted on
 * 2026-09-28; turn doc A2 to A6): the player's pick sets the chapter's
 * outcome (PLAYER DECISIONS says which, and a single player's reply writes
 * none); the length follows what the chapter is, among the lengths the
 * computed PACING block allows, the last chapter taking exactly the turns
 * left; milestones are sized to what the outcome still needs; a chapter is
 * one situation rising to a climax; its kind follows its outcome's, and a
 * contest has two sides, with three players the setup's two camps (an
 * accepted engine limit). The reply is lean (plannerReplies.ts). Since the
 * owner's feedback of 2026-09-28 the chapter asks a nearer question than its
 * outcome, one whose answer is one milestone, and names the concrete kind of
 * milestone it adds (planner v2c). Since 2026-09-30 (planner v2e) it names
 * its outcome's stages and stays within the one PACING says it settles (in
 * the story's last chapter too, the next stage only: the owner's decision),
 * and lists each step once. Since the choice-result stage of 2026-09-30
 * (planner v2f) each step result follows the rule for its kind: a challenge
 * or contest result says how the attempt turns out, an exploration result is
 * something the player chooses to do. Since the challenge-results stage of
 * 2026-10-01 the approach the players chose at the switch, and the one a
 * step's question names, are where a thread starts and no result restates
 * them (STEP_RESULTS_APPROACH, FLAVOR_APPROACH_LINE, and the milestone fields
 * in plannerReplies.ts). Today's form before the adoption is kept for the
 * eval in storyTextRound0/; adoptedPlanners.test.ts holds this equal to the
 * eval's planner v2f with that stage's measured edits (its variant
 * resultsAsOutcomes, byte for byte).
 */

/** A4's length rule. */
const LENGTH_RULE =
  "Choose the length from what the thread is: two beats for a transaction, a breather or a personal moment; three for a challenge; four for a showdown, or for the thread that settles an outcome's last open milestone. If the story's thread types or SWITCH/THREAD INSTRUCTIONS give this thread type a length, use it. Read PACING: choose one of the lengths it allows, and when it says this is the story's last thread, use exactly its number of beats and make the thread the story's climax.";

/** A4's milestone size rule. */
const MILESTONE_SIZE =
  "Size them to what PACING says the outcome still needs: while it needs more than one, each is one step toward a resolution; when this is its last one, each settles the outcome in its own direction; when the outcome is already complete, each is an aftermath that confirms or complicates the resolution its milestones already point to.";

/** A6's kind rule; in multiplayer a contest has two sides, with three players the setup's two camps. */
function kindRule(story: Story): string {
  if (!story.isMultiplayer()) {
    return "As a rule, match the thread's kind to the outcome it pushes: favorable/mixed/unfavorable resolutions → Challenge thread; three paths → Exploration thread.";
  }
  const sides =
    story.getNumberOfPlayers() === 3
      ? "with three players, the sides are the two camps the outcome's resolutions and its scoreboard name, and player1's camp is always Side A"
      : "in a two-player game, player1 is always Side A and player2 Side B";
  return `As a rule, match the thread's kind to the outcome it pushes: favorable/mixed/unfavorable resolutions → Challenge thread; Side A/Side B resolutions → Contest thread (${sides}, so the result matches the outcome's sides and its scoreboard); three paths → Exploration thread. A contest always has exactly two sides.`;
}

/**
 * The results rule's sentence on the approach (the challenge-results stage of
 * 2026-10-01, fix 5 of the second playthroughs' review; its variant
 * resultsAsOutcomes as measured: resultsFitKind 8 of 30 -> 22 of 30 plans,
 * moved): 14 of the second round's 16 chapters planned after a flavor switch
 * wrote the approach the players chose at the switch into their results
 * ("Bex coordinates the work while Jori confirms the right fittings", "Rory's
 * careful separation of documented defects"), and the rule's weak example was
 * only a different decision. It follows the challenge sentence, by player
 * count, and starts with its space.
 */
export const STEP_RESULTS_APPROACH = {
  single:
    ' The same goes for the approach the player chose at the switch (PLAYER DECISIONS) and the one a step\'s question names: the thread can start from it, but no result restates it, not even as the way the player succeeds; each result says what comes of it (weak: "Rikkit keeps his forged papers steady, and the guard waves him through"; good: "The guard waves Rikkit through without a second look").',
  group:
    ' The same goes for the approaches the players chose at the switch (PLAYER DECISIONS) and the ones a step\'s question names: the thread can start from them, but no result restates them, not even as the way a player succeeds or why a side comes out ahead; each result says what comes of them (weak: "The group keeps its forged papers steady, and the guard waves them through", "Side A\'s careful account sways the council"; good: "The guard waves the group through without a second look", "The council leans toward Side A").',
} as const;

/** A flavor pick's line in PLAYER DECISIONS (the same stage): the approach is where the thread starts, never what a result restates. */
export const FLAVOR_APPROACH_LINE = "The choice sets the approach the thread starts from, not the outcome; no step result or milestone restates it.";

/**
 * The two rules on a step's results (planner v2f, adopted at the
 * choice-result stage of 2026-09-30: the playthroughs' next turns told the
 * result instead of the choice). A challenge or contest result is rolled
 * against the option the player chose, so it says how the attempt turns out,
 * never which approach the player takes or what they say or decide; an
 * exploration result is the option at its position, so it is something the
 * player chooses to do, never how others respond. Each follows the sentence
 * planner v2e printed for its kind; the challenge sentence is followed by the
 * approach sentence (STEP_RESULTS_APPROACH, 2026-10-01).
 */
const stepResultRules = (multiplayer: boolean) =>
  multiplayer
    ? `In challenge and contest threads, each result gives an advantage or a disadvantage for the next step without closing it off. Each challenge or contest result, the milestones included, says how the players' attempts turn out, whatever they chose to do: what each side achieves or fails to achieve, and how others respond; never which approach a player takes or what they say or decide, since the options they choose decide that (weak: "The group bribes the guard instead"; good: "The guard pockets the coin and calls his sergeant anyway").${STEP_RESULTS_APPROACH.group} In exploration threads, each step's three results are three paths the players can take, and the last step's results lead toward the outcome's three resolutions, in the same order. Each exploration result is something a player chooses to do, and the step's three options offer them one each, in order: never how others respond.`
    : `In challenge threads, each result gives an advantage or a disadvantage for the next step without closing it off. Each challenge result, the milestones included, says how the player's attempt turns out, whatever they chose to do: what they achieve or fail to achieve, and how others respond; never which approach the player takes or what they say or decide, since the option they choose decides that (weak: "Rikkit bribes the guard instead"; good: "The guard pockets the coin and calls his sergeant anyway").${STEP_RESULTS_APPROACH.single} In exploration threads, each step's three results are three paths the player can take, and the last step's results lead toward the outcome's three resolutions, in the same order. Each exploration result is something the player chooses to do, and the step's three options offer them one each, in order: never how others respond.`;

function progressionItem(number: number, multiplayer: boolean): string {
  const who = multiplayer ? "players" : "player";
  return `${number}. A progression of steps, as many as the length, that tells one situation rising to a climax:
   - The thread stays with one situation: the same people, place, rival or problem from step to step. Each step raises the stakes of that situation instead of starting a new activity, and every step stays on the thread's outcome.
   - From the second step on, something pushes back: a rival moves, an ally hesitates, a cost comes due. ${stepResultRules(multiplayer)}
   - The last step is the decisive moment: its question brings the thread's question to a head.
   - Each step comes once: a thread of n beats has n different steps, and the last one never repeats the step before it.
   - Each step asks how the ${who} act${multiplayer ? "" : "s"} ("Stealth: How does Rikkit get past the Guild's night watch?").${multiplayer ? " In a contest, every step is the same moment for both sides, and its question names them all." : ""}
   - No step settles the thread early, and the ${who} can't leave or derail it.
   Weak: "Rally supporters" → "Print posters" → "Negotiate with the Guild" (three activities, and the last one belongs to a different question).
   Good: "First impression: How does Rikkit win a hearing with Sir Bram?" → "Leverage: How does Rikkit use what Sir Bram fears?" → "The ask: Sir Bram names his price in front of the Guild. How does Rikkit answer?"`;
}

/**
 * The chapter's question and kind of milestone (planner v2c, the owner's
 * feedback of 2026-09-28: a chapter asked its outcome's question again): a
 * nearer question whose answer is one milestone, about the chapter's own
 * situation, and a kind of milestone that names the concrete thing it settles.
 */
function questionItem(number: number, multiplayer: boolean): string {
  const who = multiplayer ? "[insert player names]" : "Rikkit";
  const outcome = multiplayer ? "Will the players stop the noble's conspiracy?" : "Will Rikkit stop the noble's conspiracy?";
  return `${number}. The thread's question and its kind of milestone. The question is nearer than its outcome's: its three possible milestones answer it, and each is one milestone of that outcome. Ask it about this thread's own situation (a place, a person, a deadline or an object), so that its beats can answer it; never ask the outcome's question again in other words.${
    multiplayer ? " In a contest, it asks which side comes out ahead in this situation." : ""
  } The kind of milestone names the concrete thing the answer settles, not progress toward the outcome.
   Outcome: "${outcome}" Weak thread question: "Will ${who} find enough evidence to stop the noble's conspiracy?" (the outcome's question again) Good: "Will ${who} get the noble's letters out of the manor before the guards change shifts?", with the kind of milestone "whether the letters prove the noble's hand in the conspiracy", not "progress toward stopping the conspiracy".`;
}

/**
 * The outcome's stages, and the one this chapter settles (planner v2e,
 * adopted 2026-09-30; the owner's feedback of 2026-09-29: a first chapter on
 * an outcome of three milestones already asked how to expose what its first
 * milestone should only gather): an outcome with n intended milestones has n
 * stages from start to finish, PACING names the one this chapter settles, and
 * its question, steps and three results stay within it. In the story's last
 * chapter too it settles the next stage only (the owner's decision of
 * 2026-09-30). The example is the prompt's own (Rikkit and the noble's
 * letters), so no story's names reach the prompt.
 */
function stageItem(number: number, multiplayer: boolean): string {
  const results = multiplayer ? "how well it went, which side came out ahead, or which path was taken" : "how well it went, or which path was taken";
  const outcome = multiplayer ? "Will the players stop the noble's conspiracy?" : "Will Rikkit stop the noble's conspiracy?";
  const step = multiplayer ? "How do [insert player names] expose the noble before the Guild?" : "How does Rikkit expose the noble before the Guild?";
  const who = multiplayer ? "The group" : "Rikkit";
  return `${number}. The outcome's stages, and the one this thread settles. An outcome with n intended milestones has n stages from start to finish: each thread that pushes it settles the next stage, and its milestone records how that stage went. Name the outcome's stages in order, consistent with the milestones it already has: stage 1 is what its first milestone settled, stage 2 what its second settled, and so on. PACING says which stage ${
    multiplayer ? "each" : "this"
  } thread settles: the one after the milestones the outcome already has. The thread's question, every step and its three possible milestones stay within that stage: the three milestones are three versions of that stage's result (${results}), and nothing in the thread already does what a later stage is for: no step starts, plans or carries out a later stage's task, and no result settles the outcome early. A result may still make a later stage easier or harder. Only the last stage settles the outcome itself; when the outcome is already complete, the thread is an aftermath of its last stage.
   Outcome: "${outcome}" with 3 milestones has the stages 1. prove the noble's hand; 2. turn the Guild against him; 3. stop the conspiracy. At stage 1 the thread is about the proof. Weak: a last step "${step}", or the milestone "${who}'s proof brings the noble down" (stages 2 and 3). Good: the milestones "${who} gets the noble's letters out of the manor: proof of his hand", "${who} gets one letter, which hints at his hand but proves nothing", "${who} flees the manor with nothing".`;
}

function threadList(multiplayer: boolean): string {
  const milestones = `Possible milestones, one of which is added to the outcome when the thread ends. ${MILESTONE_SIZE}`;
  if (!multiplayer) {
    return `Create the thread, with:
1. The thread's outcome is already set (PLAYER DECISIONS below). Every step and every milestone stays on that outcome.
2. The type of thread.
${stageItem(3, false)}
${questionItem(4, false)}
5. ${milestones}
${progressionItem(6, false)}

`;
  }
  return `Create a list of threads, each with:
1. The outcome ID: for each group of players, the outcome they chose (topic switch) or their switch set (flavor switch), as PLAYER DECISIONS shows. Every step stays on it.
2. Players involved (Side A and, if it's a Contest thread, Side B)
3. The type of thread.
${stageItem(4, true)}
${questionItem(5, true)}
6. ${milestones}
${progressionItem(7, true)}

`;
}

/** The resonance without a scoreboard's trailing "Scored by …" sentence. */
const withoutScoreLine = (resonance: string): string => resonance.replace(/\s*Scored by\b[^.]*\.?\s*$/i, "").trim();

/** A2's PLAYER DECISIONS: the position chosen and the outcome that sets, or the approach after a flavor switch. */
function playerDecisions(story: Story): string {
  const lines = story.getPlayerSlots().map((slot) => {
    const pick = pickedOutcome(story, slot);
    const option = pick?.optionText || "No decision made";
    const outcome = pick?.outcomeId ? story.getOutcomeById(pick.outcomeId) : null;
    const lead = story.isMultiplayer() ? "That choice pushes" : "This thread pushes";
    if (!pick) return `${slot}: ${option}`;
    if (pick.kind === "flavor") {
      const set = outcome ? `\n${lead} the outcome the switch set: ${outcome.question} (${outcome.id}). ${FLAVOR_APPROACH_LINE}` : "";
      return `${slot} chose: "${option}"${set}`;
    }
    const pushes = outcome ? `\n${lead}: ${outcome.question} (${outcome.id}). Why it matters: ${withoutScoreLine(outcome.resonance)}` : "";
    return `${slot} chose direction ${pick.choice + 1} of ${pick.directions}: "${option}"${pushes}`;
  });
  return ["PLAYER DECISIONS:", ...lines].join("\n");
}

export class ThreadPromptService {
  private static readonly SECTIONS: SectionConfig = {
    gameMode: true,
    guidelines: true,
    storyElements: true,
    worldFacts: true,
    stats: true,
    detailedStats: false,
    outcomes: true,
    players: true,
    previousThreads: true,
    // The switch/thread instructions are for the planners only: the switch
    // planner and this chapter planner. No turn reads them; the switch turn
    // applies each stat's own "Adjustments after threads" (BeatPromptService)
    switchAndThreadInstructions: true,
  } as const;

  static createThreadPrompt(story: Story): string {
    return (
      this.createContextSection(story) +
      "\n\n" +
      this.createInstructionsSection(story) +
      "\n\n" +
      "#".repeat(100) +
      "\n\nRemember: these are just examples. The thread (or set of threads) that you will be creating now must be fully custimized to work for the current story" +
      "\n\n======= CURRENT GAME STATE =======\n" +
      StoryStatePromptService.createStoryStatePrompt(story, this.SECTIONS) +
      "\n\n" +
      StoryStatePromptService.getSwitchConfiguration(story, true, playerDecisions(story)) +
      "\n\n" +
      threadPacingBlock(story)
    );
  }

  private static createContextSection(story: Story): string {
    const multiplayer = story.isMultiplayer();
    return `CONTEXT

Outcomes
pose questions that define the ending of the story. ("${multiplayer ? "Will [insert player names] unravel" : "Will Rikkit unravel"} the mystery of the dark forest?")
Outcomes can be individual or shared between players.
Each outcome has 3 possible resolutions.

Milestones
are added to outcomes at the end of threads. Milestones mark progress toward the outcome's resolution and make some resolutions more likely.

Beats
are a narrative structure of 5-6 paragraphs of text (3-5 sentences each) followed by a decision that the player must make.
Beats are the smallest narrative unit in the game.

Switches
are a narrative structure of exactly 1 beat. Their purpose is to give the player agency over the direction of the story.
So far, the players have only decided which direction this thread should take. You must now create a thread (or set of threads) that is based on these choices.
${multiplayer ? "Switches and the decisions that players made in them also determine how you should allocate players to threads.\n" : ""}
Threads
are a narrative structure of 2-4 beats that push one story outcome closer to its resolution.
They do this by adding a milestone to an outcome. Which milestone is added depends on how the thread unfolds.

Story structure
A story follows the following structure: Switch, Thread, Switch, Thread, ..., Ending.
It is time to create the next thread to this sequence for all players.`;
  }

  private static createInstructionsSection(story: Story): string {
    const multiplayer = story.isMultiplayer();
    let instructions = `======= YOUR JOB: GENERATE THE NEXT THREAD (OR SET OF THREADS) TO MOVE THE STORY FORWARD =======

OUTPUT FORMAT

${multiplayer ? "A duration for this thread (or set of threads) between 2-4 beats." : "The thread's length: 2 to 4 beats, one step per beat."}
- 2 beats: interludes, breathers, reflections, and simple transactions
--- Simple transactions (e.g. buying an artifact, meeting a friendly npc to get information)
--- Reflections (e.g. a moment of realization, a moment of doubt)
--- Resource gathering and management (e.g. gathering materials, buying supplies, finding a place to sleep, sending armies around)
--- Maintenance (e.g. healing, repairing a ship, taking care of a pet)
--- Quick decisions (e.g. deciding whether to trust someone, choosing a contract with the crew)
--- Information exchange (e.g. interviewing a witness, consulting an expert, sharing intel)
- 3 beats: drama and challenges
--- Encounters (e.g. a fight, an escape)
--- Investigations (e.g. crime scene, tracking someone)
--- Social challenges (e.g. navigating a social event, building alliances, resolving conflicts)
--- Skill challenges (e.g. climbing a mountain, crafting a special item, performing a ritual)
--- Journeys (e.g. traveling through dangerous territory, navigating obstacles)
--- Character development (building a relationship, facing a fear)
- 4 beats: showdowns and transformations
--- Showdowns (e.g. a epic battle, the make-or-break concert of the band, the council session to become the new king)
--- Transformative events (e.g. ascension ceremonies, magical transformations, a coronation)
${LENGTH_RULE}${multiplayer ? " In multiplayer, the length is the same for every thread in this batch." : ""}`;

    if (multiplayer) {
      // The first thread plan runs after the opening switch beat, at turn 1
      if (!story.hasThreadAnalysis()) {
        instructions += `

MANDATORY FIRST THREAD REQUIREMENT:${" "}
Since this is the first thread of a multiplayer game, you MUST create EXACTLY ONE thread that involves ALL players together.${" "}
DO NOT create multiple threads or separate players in any way.
ALL players must experience the same thread together as a group.
This is NON-NEGOTIABLE - no matter what the switches or player choices were, all players MUST end up in the same thread.
`;
      } else {
        instructions += `

A summary of how you want to set up the threads based on the switch configuration and player choices.

Possible player configurations:
- Independent threads: Each player gets their own standard thread
- Shared threads: All players are in the same thread
- Mixed setup: Some players are in a joint thread while others are in independent threads.`;
      }
    } else {
      instructions += `\n\nFor single-player games, there is always only one thread.`;
    }

    const who = multiplayer ? "The group" : "Rikkit";
    instructions += `\n\nThread kinds:
1. Challenge Threads
- One or several players work towards a goal
- Resolutions are favorable/mixed/unfavorable
- Example milestones (one will be added to the outcome at the end of the thread): "${who} finds the artifact", "${who} finds a clue about the artifact's location", "${who} fails to find any trace of the artifact"`;

    if (multiplayer) {
      instructions += `
2. Contest Threads
- Players are split into Side A and Side B, competing over an outcome
- Resolutions are "Side A wins"/"Mixed result"/"Side B wins"
- Example milestones (one will be added to the outcome at the end of the thread): "Side A convinces the council", "Both sides reach a compromise", "Side B convinces the council"
- Only relevant for multiplayer games with a competitive element (game mode is "competitive" or "cooperative-competitive")`;
    }

    const paths = multiplayer
      ? `"[insert player name] takes over the family hotel", "[insert player name] helps at the family hotel while doing occassional photography jobs", "[insert player name] is no longer engaged in the family business"`
      : `"Rikkit takes over the family hotel", "Rikkit helps at the family hotel while doing occasional photography jobs", "Rikkit is no longer engaged in the family business"`;
    instructions += `
${multiplayer ? "3" : "2"}. Exploration Threads
- Players explore their characters (preferences, morality, etc.) or choose among equally valid narrative paths
- Exploration Threads should not include any challenges or contests.
- Steps in Exploration Threads should never be about succeeding or failing at something.
- Resolutions are "Resolution 1"/"Resolution 2"/"Resolution 3" representing different choices or directions
- Example milestones (one will be added to the outcome at the end of the thread): ${paths}
- Often works well with 2-beat threads

${kindRule(story)}

${threadList(multiplayer)}EXAMPLE 1: 3-BEAT CHALLENGE THREAD
${multiplayer ? MULTIPLAYER_CHALLENGE_EXAMPLE : SINGLE_PLAYER_CHALLENGE_EXAMPLE}`;

    if (multiplayer) {
      instructions += `

EXAMPLE 2: 2-BEAT CONTEST THREAD
Title: Swaying the Council
Side A: player1 (supports military action)
Side B: player2 (advocates for diplomacy)
Type: Council Debate
Outcome: Will there be war? (with ID shared_will_there_be_war)
Possible Milestones:
- Side A Wins: "The council votes for immediate military action"
- Mixed: "The council decides to prepare for war while attempting negotiations"
- Side B Wins: "The council commits to diplomatic resolution"

Beat Progression:
1. Opening Arguments
Question: Opening Arguments: How do [insert player names] present their cases to the council?
- Side A Wins: Military urgency resonates with the council
- Mixed: The council remains divided and uncertain
- Side B Wins: Diplomatic opportunities capture the council's interest
(Leads to the climax in beat 2 without preempting the council's final vote.)

2. Final Deliberation
Question: Addressing Concerns: How do [insert player names] address the council's key concerns?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.`;
    }

    instructions += `

EXAMPLE ${multiplayer ? "3" : "2"}: 2-BEAT EXPLORATORY THREAD
Title: Personal Crossroads
Players: player1
Type: Choosing a Life Path
Outcome: Will Alex choose family or ambition? (with ID player1_family_vs_ambition)
Possible Milestones:
- Resolution 1: "Alex prioritizes family obligations over the job opportunity"
- Resolution 2: "Alex finds a compromise that partially satisfies both family and career"
- Resolution 3: "Alex pursues the career opportunity despite family disapproval"

Beat Progression:
1. Weighing the Options
Question: Conversation with Family: How does Alex approach the difficult conversation with family?
- Resolution 1: Alex tries to find out what is important to his family
- Resolution 2: Alex tries to convince his family that following the job opportunity is a good idea
- Resolution 3: Alex lies about the job opportunity to make it seem more appealing
(Each resolution provides different context for the final decision without avoiding it or forcing any particular final resolution.
Each resolution says something about Alex's character and motivations.
The beat is not about succeeding or failing, but about exploring Alex's character.)

2. Making the Choice
Question: Choosing a Career: What does Alex ultimately prioritize when forced to choose?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.
`;

    instructions += "\nAlso consider the SWITCH/THREAD INSTRUCTIONS below that are specific to this story.\n";

    return instructions;
  }
}

const MULTIPLAYER_CHALLENGE_EXAMPLE = `Players (Side A): player1, player2
Type: Infiltration
Outcome: Will the players stop the noble's conspiracy? (with ID shared_uncover_conspiracy)
Possible Milestones:
- Favorable: "The group steals incriminating documents about the noble's involvement"
- Mixed: "The group finds hints about the noble's involvement but no solid proof"
- Unfavorable: "The group flees the noble's manor and fails to find any evidence"
Title: Infiltrating the Noble's Manor

Beat Progression:
1. Getting Past the Guards
Question: Stealth: How do [insert player names] approach the manor's security?
- Favorable: The guards are distracted, giving easy access to the manor
- Mixed: [insert player names] find a way in but the guards are on higher alert
- Unfavorable: The guards are suspicious and increase their patrols
(Note how the beat progression can continue no matter the resolution of step 1.)

2. Searching the Study
Question: Thievery: How do [insert player names] search the study without leaving traces?
- Favorable: [insert player names] find promising leads and the study remains undisturbed
- Mixed: [insert player names] find some leads but leave signs of searching
- Unfavorable: The study is a mess and [insert player names] alert the household

3. Final Confrontation
Question: Escape: The noble returns early! How do [insert player names] handle the situation?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.`;

const SINGLE_PLAYER_CHALLENGE_EXAMPLE = `Players: player1
Type: Infiltration
Outcome: Will Rikkit stop the noble's conspiracy? (with ID player1_uncover_conspiracy)
Possible Milestones:
- Favorable: "Rikkit steals incriminating documents about the noble's involvement"
- Mixed: "Rikkit finds hints about the noble's involvement but no solid proof"
- Unfavorable: "Rikkit flees the noble's manor and fails to find any evidence"
Title: Infiltrating the Noble's Manor

Beat Progression:
1. Getting Past the Guards
Question: Stealth: How does Rikkit approach the manor's security?
- Favorable: The guards are distracted, giving easy access to the manor
- Mixed: Rikkit finds a way in but the guards are on higher alert
- Unfavorable: The guards are suspicious and increase their patrols
(Note how the beat progression can continue no matter the resolution of step 1.)

2. Searching the Study
Question: Thievery: How does Rikkit search the study without leaving traces?
- Favorable: Rikkit finds promising leads and the study remains undisturbed
- Mixed: Rikkit finds some leads but leaves signs of searching
- Unfavorable: The study is a mess and Rikkit alerts the household

3. Final Confrontation
Question: Escape: The noble returns early! How does Rikkit handle the situation?
Since this is the final beat of the thread, the possible results are the list of possible milestones that can be added to the outcome.`;

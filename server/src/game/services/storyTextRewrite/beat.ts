import { z } from "zod";
import type { Story } from "core/models/Story.js";
import { GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION } from "../prompts/BeatPromptService.js";
import { beatStep } from "../storyTextSteps.js";
import { asArray, asDiscriminatedUnion, asObject, asUnion, textFrom, type SplitTextRequest } from "./common.js";

/*
 * Stage 4 of the text-model eval: the single-player beat request rewritten
 * in GPT-6 style. The fixed rules (identical for every beat call, so they
 * cache) state each rule once; the per-call message holds this beat's
 * branch instructions, then production's story state verbatim; the schema
 * is production's field set and key order with the named descriptions
 * rewritten and the array counts enforced. Eval only: the harness's
 * variants.ts is the one caller, and production keeps storyTextSteps.ts.
 */

/** full: production's planning fields. slim: Stage 3's slim field list (restated, so the trims stay deletable). */
export type RewriteScaffold = "full" | "slim";

const STATE_MARKER = "======= CURRENT GAME STATE =======";

const PHRASES_TO_AVOID = [
  "a testament to",
  "tapestry",
  "the air is thick",
  "the air hums",
  "a mix of",
  "can't help but",
  "sends a shiver",
  "palpable",
  "heart pounds",
  "a sense of",
  "hangs in the air",
  "it's not just",
  "little did",
  "in the distance",
  "delve",
  "it's worth noting",
  "genuinely",
];

const BEAT_FIXED = [
  "You are the narrator of an interactive story game. You write the next beat of the story for one player, in the tone that the story's guidelines set.",
  "",
  "Prose style",
  '- Write in the second person and the present tense: the player character is "you". Refer to other characters by name or in the third person.',
  "- Write 5 to 6 paragraphs of 3 to 5 sentences each, as plain prose without headings, lists or bold type.",
  "- Show, don't tell: stay in the scene and let actions and words carry what happens. Bad: \"The old sage gives you a cryptic hint.\" Good: \"The old sage leans in: 'When the sun sets, the moon will rise.'\"",
  "- Give characters a voice with direct speech that spells out their actual words, for the player character and the NPCs alike.",
  '- Vary how beats and paragraphs open, and avoid openings such as "You step", "You stand", "You sit" and "You lean".',
  "- Spell every name exactly as the story state does.",
  `- Leave out these phrases: ${PHRASES_TO_AVOID.map((p) => `"${p}"`).join(", ")}, and the pattern "This isn't about X. It's about Y." Leave out contrastive "X, not Y" framing too.`,
  '- The last paragraph never mentions or hints at the choices ahead, since the player reads the options right below the text. Formulations to avoid there: "The path before you ...", "Will you do X, or will you do Y?", "You must decide: ...", "You weigh your options carefully", "the complexity of your decision ...".',
  "",
  "Continuity and consistency",
  "- From the second beat on, the first paragraph picks up exactly where this player's previous beat ended. It narrates, in the scene, how the player carries out the action they chose, and the result the game has already decided for it.",
  "- Game words stay out of everything the player sees (title, text, options and interludes): NPC, player character, stat, beat, milestone, points, success rate.",
  "- If the story state is inconsistent, use the most plausible reading and continue, and never mention the inconsistency where the player can see it.",
  "",
  "How the game works",
  "- A story runs switch, thread, switch, thread and so on, and closes with an ending. Every part is made of beats: one text per player, followed by a decision.",
  '- A switch is a single beat that gives the player a say in where the story goes. In a topic switch, the player picks which question the next thread takes up: exploring the wastelands (pushing the outcome "Does [player] unravel [mystery]?") or attending a meeting of the resistance (pushing "Will the resistance take over [city]?"). In a flavor switch, the question is already set and the player picks the approach: with bounty hunters on the player\'s trail, an evasive manoeuvre, a negotiation or a direct confrontation.',
  "- A thread is 2 to 4 beats that push one or more outcomes towards their resolution. For each of those outcomes it asks which of its possible milestones the outcome will get. In challenge and contest threads the stakes rise from beat to beat, each beat ends favorable, mixed or unfavorable, each result changes the chances of the next beat, and the last beat decides the milestone.",
  "- Options shift those chances with points. It takes 50 points to turn a 33/34/33 distribution into 50/50/0: 16 points move 16 percentage points from unfavorable to mixed, and 34 points move 17 percentage points from unfavorable to favorable.",
  "",
  "Changes to the story state",
  "- A player who chose a sacrifice option loses what they sacrificed, and a player who chose a reward option gains the reward. To replace an item in a string[] stat, remove it with removeElement and add the new one with addElement.",
  "- Within a thread, only stats marked as changeable in beat resolutions change (sacrifices and rewards aside), and only a little.",
  "- Add a new story element only when it is likely to come back in later beats; most beats add none. NPCs and locations are the usual kinds, and items, organizations, mysteries, conflicts, rumors and projects work too.",
  "- When the player meets a story element for the first time, introduce it properly and record the introduction. Refer to elements the player already knows without introducing them again.",
  "- Record only facts that the story state does not hold yet, 3 or more per switch and per thread step. Link each fact to the element it is about, and use world only when no element fits. Elements created in this beat get no facts.",
  "- Plant one detail in the world that makes the player curious without explaining what is going on.",
  "",
  "Options",
  "- When a beat has options, the stats shape which options exist, through the story rather than the points: when a force|agility stat leans towards force, the options are forceful rather than sneaky.",
  "- Offer sacrifice and reward options only for stats whose definitions allow them.",
  "",
  "The field descriptions in the reply format are part of these instructions.",
].join("\n");

// ---------------------------------------------------------------- per call

const showsImages = (story: Story) => story.hasImages() || story.generatesImages();

function threadStep(story: Story): { step: number; of: number } {
  return { step: story.getCurrentThreadBeatsCompleted() + 1, of: story.getCurrentThreadDuration() };
}

/** Challenge and contest threads resolve favorable/mixed/unfavorable; exploration threads do not. */
const isChallengeThread = (story: Story) => story.getCurrentThreadType() !== "exploration";

const TONE =
  "The result of the previous beat sets the tone of this one: momentum after a favorable result, difficulty after an unfavorable one. The thread configuration says what success and failure mean here.";

const THREAD_RESOLVED =
  "The previous thread was just resolved, so any stat may change now, as its adjustments after threads and what was at stake suggest. Add one milestone for each outcome of each resolved thread, based on the thread's resolution.";

function switchLines(story: Story): string[] {
  const opening = story.isFirstBeat()
    ? [
        "This is the first beat of the story. Introduce the player character, hint at the outcomes that will decide their ending, and introduce some of the story elements, recording those introductions. Add no new story elements and no new facts, and still make this beat a good switch.",
      ]
    : [
        "Narrate how the previous thread was resolved, and spend at least one full paragraph on its new milestone: what it is, what it means for its outcome, and why it matters to the player.",
        THREAD_RESOLVED,
        TONE,
      ];
  return [
    "Write the next beat: a switch.",
    "The beat's title is the title of the switch this beat implements, and nothing else.",
    ...opening,
    "The options of this beat are exploration options.",
    "In a topic switch, the options are the directions that the switch configuration lists; in a flavor switch, they are different approaches to the question the switch sets. Offer nothing similar to the earlier threads, and let the options reinforce the story's key conflicts and types of decisions.",
  ];
}

function threadLines(story: Story): string[] {
  const { step, of } = threadStep(story);
  const last = step === of;
  return [
    `Write the next beat: step ${step} of ${of} of the current thread.`,
    `The beat's title is the thread's title followed by "(${step}/${of})".`,
    "Follow the thread's progression plan (for example greeting, then conversation, then a call to action). Set up the scene that poses this step's question, and stop before its resolution: when a troll blocks the path, the beat ends with the troll still in the way, and how the players get past it is decided only after they choose.",
    last
      ? "This is the thread's last step. Its resolution is decided after the player's choice, so the text does not narrate how the thread ends."
      : "The thread goes on after this beat, so nothing settles its question yet: in a three-step thread about acquiring an artifact, the player neither gains it nor loses the chance for good in steps 1 and 2.",
    ...(step > 1 && isChallengeThread(story) ? [TONE] : []),
    `The options of this beat are ${isChallengeThread(story) ? "challenge" : "exploration"} options.`,
    "The options answer the question of this step of the thread.",
  ];
}

function endingLines(): string[] {
  return [
    "Write the next beat: the ending of the story.",
    'The beat\'s title is "The End".',
    "This is the ending of the story. Close the previous thread first, then the story as a whole. Tie the ending to each of the player's outcomes and why it matters to them, and mention the stats worth mentioning. Add no new story elements.",
    THREAD_RESOLVED,
  ];
}

function imageLines(story: Story): string[] {
  if (!showsImages(story)) return [];
  return [
    `The source of player portraits is ${story.isBasedOnTemplate() ? "template" : "story"}.`,
    ...(story.hasImages()
      ? []
      : ["The image library has no pictures besides the player portraits yet, so the images you can show are the player portraits and the one you request."]),
    ...(story.isFirstBeat() ? ["Show the portrait of the player character this beat is for, plus a picture of another story element."] : []),
  ];
}

function branchLines(story: Story): string[] {
  switch (story.getCurrentBeatType()) {
    case "switch":
      return switchLines(story);
    case "thread":
      return threadLines(story);
    case "ending":
      return endingLines();
    default:
      throw new Error(`Stage 4 rewrite: no beat instructions for beat type ${story.getCurrentBeatType()}`);
  }
}

function perCallInstructions(story: Story): string {
  const [heading, ...lines] = [...branchLines(story), ...imageLines(story)];
  return [heading, ...lines.map((line) => `- ${line}`)].join("\n");
}

// ---------------------------------------------------------------- schema

/** Stage 3's slim scaffold: the plan strings it drops, and the option considerations it keeps. */
const SLIM_DROPPED_PLAN_STRINGS = [
  "forPlayer",
  "developmentsToNarrate",
  "beatTypeConsiderations",
  "otherBeats",
  "worldBuilding",
  "showDontTellPreviousDecision",
] as const;
const SLIM_DROPPED_OPTION_CHECKS = ["keyConflictsAndDecisions", "phaseRequirements", "statsAffectingOptions"] as const;

const omitting = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, true] as const));

function textDescription(story: Story): string {
  const prose =
    "The beat's prose, written in the prose style of the instructions and built on the show-don't-tell points of the plan.";
  if (!showsImages(story)) return `${prose}\nThis story has no images, so the text carries no image tags.`;
  const requested = story.generatesImages();
  return [
    prose,
    "Image tags show pictures from the story's image library in the text:",
    '- Format: [image id=mrs_sukuhashi source=template desc="Mrs. Sukuhashi" float=right]. desc is the caption and names at least what the picture shows; float is left or right and defaults to left.',
    "- Put each tag at the start of the paragraph it belongs to, one or two tags per beat (three are too many), and none in or after the last paragraph. A good spread is one tag at the first paragraph and one at the third or fourth.",
    `- Use only ids that the image library lists${requested ? ", or the id of the image you request in this reply" : ""}, with the library's source.`,
    "- Show player characters by their slot ids (player1, player2 and so on). The portrait of the player this beat is for appears only in the first beat of the story.",
    ...(requested ? ["- Show an image you request in this reply in the third or fourth paragraph, which gives it time to be generated."] : []),
  ].join("\n");
}

const IMAGE_REQUEST_ADDITION =
  "A character analysing magic glyphs calls for a new image rather than their generic one; an existing picture of a flock of birds needs no new one just because the weather changed. " +
  GENERIC_ELEMENT_IMAGES_FIRST_INSTRUCTION;

const OPTIONS_DESCRIPTION = [
  "The player's choices at the end of this beat, as a set:",
  '- Be specific. Bad: "Propose a compromise". Good: say what the compromise is. Bad: "Create a diversion". Good: "Divert the guards by throwing some gold coins around."',
  "- Name only the action or decision, never its actual or likely consequences. A sacrifice or reward option names the stat it trades, so the player knows the trade-off, and leaves the words sacrifice and reward out.",
  "- Stay in the scene: no option leaves it, suddenly does something else, or derails the core theme of the switch or thread.",
  "- Whatever the text narrated is already established; the options decide how the story goes on from there.",
  "- At most one option in the set is a sacrifice or reward option, and the others are normal. A sacrifice is always lost and a reward always gained, whatever the result.",
  '- Word sacrifice and reward options with flavour. Bad: "Sacrifice 10% emotional stability for a higher chance of catching his attention." Good: "Bite your lips (-10% stability) and intercept Adrian directly."',
  "- Offer nothing similar to the options this player already had in this thread.",
].join("\n");

const INTERLUDES_DESCRIPTION = [
  "Snippets the player sees while the next beat is being written:",
  "- one stream of consciousness of the player character this beat is for, in the first person, with specific associations, emotions and unfinished thoughts rather than a polished monologue (imageId = the player's slot). Only this character's thoughts, since the player cannot know anyone else's;",
  "- one or two about story elements that matter in this beat (imageId = the element's id);",
  "- at most one about the world in general (any available imageId, or cover for the story's cover image).",
  'Imply interesting details instead of spelling them out: "The Guild Hall is right behind the dry canal." (Why is the canal dry?) "The dream distillery is surrounded by scaffolding." (What is a dream distillery?) When the story has no images, the interludes keep their text and use imageSource none.',
].join("\n");

/** Production's two option kinds with the rewritten resource, text and modifier descriptions. */
function rewrittenOptionKinds(options: z.ZodArray<z.ZodTypeAny>) {
  const union = asDiscriminatedUnion(options.element, "option");
  const [exploration, challenge] = union.options.map((option, i) => asObject(option, `option kind ${i + 1}`));
  const modifiers = asArray(challenge.shape.modifiersToSuccessRate, "modifiersToSuccessRate");
  const modifier = asObject(modifiers.element, "modifier");
  // optionType is production's own instance, restated so the union's discriminator is typed
  return z.discriminatedUnion("optionType", [
    exploration.extend({
      optionType: exploration.shape.optionType,
      resourceType: exploration.shape.resourceType.describe(
        "'sacrifice' when choosing this option costs the player some of a stat, 'reward' when it gains them some of a stat, and 'normal' otherwise."
      ),
    }),
    challenge.extend({
      optionType: challenge.shape.optionType,
      resourceType: challenge.shape.resourceType.describe(
        "'sacrifice' when the player gives up some of a stat for a higher chance of success, 'reward' when they gain some of a stat and accept a lower chance, and 'normal' otherwise."
      ),
      text: challenge.shape.text.describe("What the player reads for this challenge option."),
      modifiersToSuccessRate: z
        .array(
          modifier.extend({
            effect: modifier.shape.effect.describe(
              "Points that the stat's current value adds to or subtracts from this option's chance of success, between -15 and +15. When the stat's definition names a larger effect, use 15 (or -15)."
            ),
          })
        )
        .max(2)
        .describe(
          "The most relevant stats (individual or shared) whose current values raise or lower this option's chance of success. Leave out the bonus or malus of a sacrifice or reward, which the game adds on its own. Count negative effects as well as positive ones, and use only stats that exist in the story state."
        ),
    }),
  ]);
}

function rewrittenPlan(plan: z.AnyZodObject, scaffold: RewriteScaffold): z.AnyZodObject {
  const showDontTell = asArray(plan.shape.showDontTell, "showDontTell")
    .length(3)
    .describe(
      "The most important actions and developments this beat covers, each with a short pointer on how to show it rather than tell it (concrete actions, direct speech). From the second beat on, the first is the player carrying out the action they chose, and how it plays out."
    );
  if (scaffold === "full") return plan.extend({ showDontTell });
  const considerations = asUnion(plan.shape.optionConsiderations, "optionConsiderations");
  const [asText, detailed] = considerations.options;
  const slimConsiderations = z.union([asText, asObject(detailed, "optionConsiderations object").omit(omitting(SLIM_DROPPED_OPTION_CHECKS))]);
  return plan.omit(omitting(SLIM_DROPPED_PLAN_STRINGS)).extend({
    showDontTell,
    optionConsiderations:
      considerations.description === undefined ? slimConsiderations : slimConsiderations.describe(considerations.description),
  });
}

function rewrittenPlayer(player: z.AnyZodObject, story: Story, scaffold: RewriteScaffold): z.AnyZodObject {
  const options = asArray(player.shape.options, "options");
  const optionList = z.array(rewrittenOptionKinds(options));
  const ending = story.getCurrentBeatType() === "ending";
  const imageRequest: z.ZodTypeAny | undefined = player.shape.imageRequest;
  return player.extend({
    plan: rewrittenPlan(asObject(player.shape.plan, "plan"), scaffold),
    ...(imageRequest ? { imageRequest: imageRequest.describe(`${imageRequest.description ?? ""} ${IMAGE_REQUEST_ADDITION}`) } : {}),
    text: player.shape.text.describe(textDescription(story)),
    options: ending
      ? optionList.describe("The story ends with this beat, so this list stays empty.")
      : optionList.length(3).describe(OPTIONS_DESCRIPTION),
    interludes: asArray(player.shape.interludes, "interludes").length(3).describe(INTERLUDES_DESCRIPTION),
  });
}

function rewrittenSchema(production: z.AnyZodObject, story: Story, scaffold: RewriteScaffold): z.AnyZodObject {
  const root =
    scaffold === "slim" ? production.omit(omitting(["statsAffectingDecisionConsequences", "multiplayerCoordination"])) : production;
  return root.extend({ player1: rewrittenPlayer(asObject(production.shape.player1, "player1"), story, scaffold) });
}

/** The Stage 4 request for a single-player beat; a multiplayer story throws. */
export function rewriteBeatRequest(story: Story, scaffold: RewriteScaffold): SplitTextRequest {
  if (story.isMultiplayer()) throw new Error("Stage 4 rewrite covers single-player beats");
  const production = beatStep.request(story);
  return {
    fixed: BEAT_FIXED,
    perCall: `${perCallInstructions(story)}\n\n${textFrom(production.prompt, STATE_MARKER, "story state")}`,
    schema: rewrittenSchema(asObject(production.schema, "beat set"), story, scaffold),
  };
}

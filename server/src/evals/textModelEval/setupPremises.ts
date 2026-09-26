import { DEFAULT_TURNS } from "core/config.js";
import { GameModes, type GameMode, type PlayerCount } from "core/types/index.js";

/*
 * The 18 frozen setup premises: 13 merged from the site's suggestion prompts
 * (client/src/page/data/suggestionData.ts) and 5 reconstructed from stored
 * custom stories (title and world). Frozen so the eval's inputs cannot
 * change between rounds when the site's suggestions change.
 *
 * COPY of the client's category instructions and field labels
 * (client/src/page/components/StoryInitializer.tsx, categoryConfigs and
 * buildMergedPrompt). Delete this copy if buildMergedPrompt moves to core.
 */

type Category =
  | "flexible"
  | "enjoy-fiction"
  | "vent-about-reality"
  | "pretend-to-be"
  | "see-your-future-self"
  | "read-with-kids"
  | "learn-something";

const CATEGORY_CONFIGS: Record<Category, { instruction: string; fields: { key: string; label: string }[] }> = {
  flexible: {
    instruction: "Create a story based on the user's prompt without specific constraints.",
    fields: [],
  },
  "enjoy-fiction": {
    instruction:
      "Create an engaging fictional story that prioritizes entertainment, immersion, and narrative satisfaction.",
    fields: [],
  },
  "vent-about-reality": {
    instruction:
      "Create a satirical story and/or simulation that allows the user to explore and critique real-world frustrations through fiction.",
    fields: [{ key: "frustration", label: "What's bothering you?" }],
  },
  "pretend-to-be": {
    instruction:
      "Create a role-playing story that allows the user to experience life from a specific perspective or profession.",
    fields: [
      { key: "role", label: "What role do you want to experience?" },
      { key: "aspects", label: "What aspects interest you most?" },
    ],
  },
  "see-your-future-self": {
    instruction:
      "Create a story that helps the user visualize their future self and the potential life paths and consequences of current decisions.",
    fields: [
      { key: "currentSituation", label: "Describe yourself and your situation" },
      { key: "potentialChanges", label: "How is your future self different?" },
    ],
  },
  "read-with-kids": {
    instruction:
      "Create an age-appropriate story designed for shared reading that engages both children and adults.",
    fields: [{ key: "kidAge", label: "How old is the child?" }],
  },
  "learn-something": {
    instruction:
      "Create a story that teaches specific concepts in the context of an engaging and entertaining story.",
    fields: [
      { key: "learningGoals", label: "What should the story teach?" },
      { key: "targetAudience", label: "Who is the target audience?" },
    ],
  },
};

/** The client's buildMergedPrompt, for a suggestion's fields and prompt text. */
export function buildMergedPrompt(
  category: Category,
  fields: Record<string, string>,
  prompt: string
): string {
  if (category === "flexible") {
    return prompt;
  }
  const config = CATEGORY_CONFIGS[category];
  let merged = `${config.instruction}\n\n`;
  for (const field of config.fields) {
    const value = fields[field.key];
    if (value && value.trim()) {
      merged += `${field.label}: ${value}\n`;
    }
  }
  if (prompt && prompt.trim()) {
    merged += `\nAdditional context: ${prompt}`;
  }
  return merged.trim();
}

export type SetupPremise = {
  id: string;
  premise: string;
  playerCount: PlayerCount;
  gameMode: GameMode;
  category: Category;
  tags: { kids: boolean; dark: boolean };
  source: string;
  maxTurns: number;
};

type Draft = Omit<SetupPremise, "premise" | "maxTurns" | "tags"> & {
  fields?: Record<string, string>;
  prompt: string;
  kids?: boolean;
  dark?: boolean;
};

const DRAFTS: Draft[] = [
  // One player, from the suggestions
  {
    id: "setup-vent-subscription",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "vent-about-reality",
    source: "suggestionData vent-about-reality singlePlayer #3",
    fields: {
      frustration:
        "Subscription services that make canceling nearly impossible with hidden fees, require calling during business hours, and transfer you through seven departments",
    },
    prompt:
      "I'm trying to cancel my $9.99/month subscription to 'Daily Bread Delivery,' navigating an absurd cancellation process culminating in a final boss battle with the Retention Department...",
  },
  {
    id: "setup-pretend-er-doctor",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "pretend-to-be",
    source: "suggestionData pretend-to-be singlePlayer #1",
    dark: true,
    fields: {
      role: "emergency room doctor",
      aspects:
        "making life-or-death decisions under extreme time pressure with incomplete information while managing patient families and hospital bureaucracy",
    },
    prompt:
      "I want to understand the weight of life-or-death choices and how medical professionals balance compassion with clinical detachment...",
  },
  {
    id: "setup-learn-lemonade",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "learn-something",
    source: "suggestionData learn-something singlePlayer #1",
    fields: {
      learningGoals: "Budget allocation and profit margins",
      targetAudience: "middle school students",
    },
    prompt:
      "I'm running a lemonade stand learning to track expenses, calculate profit margins, and make decisions about reinvesting earnings while dealing with seasonal demand changes...",
  },
  // One player, reconstructed from stored custom stories (title and world)
  {
    id: "setup-custom-shed",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "flexible",
    source: "stored custom story 29f6a4a6",
    prompt:
      "The Secret Kingdom Under the Shed. Beneath the ordinary backyard lies a wondrous underground kingdom, home to a vibrant society of mole people who cherish curiosity, kindness, and cooperation. The mole people welcome visitors of all backgrounds, and their world is filled with magical tunnels, glowing crystals, and talking animals. Here, everyone is valued for their unique gifts, and adventure is always just a tunnel away.",
  },
  {
    id: "setup-custom-vanilla",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "flexible",
    source: "stored custom story 36a5400b (two more stored setups share its premise)",
    prompt:
      "The Curious Case of the Vanilla Berries. The Whispering Woods is a vibrant, enchanted forest where animals of all kinds live in harmony, each with their own unique talents and quirks. Magic is subtle but ever-present, and the natural world is full of mysteries waiting to be unraveled by the curious and the brave. Diversity is celebrated here: creatures of all backgrounds, abilities, and personalities contribute to the forest's lively community.",
  },
  {
    id: "setup-custom-avalon",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "flexible",
    source: "stored custom story 3a158d48 (4d3705f7 shares its world)",
    prompt:
      "The Heart of New Avalon. In the bustling city of New Avalon, magic and technology intertwine, creating a vibrant metropolis where tradition and innovation coexist. The city is a melting pot of cultures, backgrounds, and identities, where anyone can rise to prominence regardless of origin or appearance. Here, the mysterious disappearance of the city's magical heart threatens to unravel the delicate balance that keeps New Avalon thriving.",
  },
  {
    id: "setup-custom-neo-tokyo",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "flexible",
    source: "stored custom story c1047ba0",
    dark: true,
    prompt:
      "Impossible Murders: A Neo-Tokyo Detective Story. Neo-Tokyo, 2098: a city of neon-lit skyscrapers, rain-slicked streets, and ceaseless digital chatter. Here, tradition and hyper-advanced technology collide, creating a society where anyone can be anything, and the boundaries of identity are fluid. In this world, diversity is woven into the fabric of daily life, and the impossible is only a matter of perspective.",
  },
  {
    id: "setup-custom-susan",
    playerCount: 1,
    gameMode: GameModes.SinglePlayer,
    category: "flexible",
    source: "stored custom story fdaeefaf",
    prompt:
      "Susan's Magical Night: Adventures with the Stuffed Animals. Every night, Susan's bedroom transforms into a magical realm where her beloved stuffed animals come to life. The world is a blend of cozy childhood wonder and gentle adventure, filled with talking toys, shimmering moonbeams, and secret passageways hidden among the blankets and bookshelves. Here, kindness, imagination, and teamwork are the greatest powers, and everyone is welcome just as they are.",
  },
  // Two players
  {
    id: "setup-fiction-bounty-hunters",
    playerCount: 2,
    gameMode: GameModes.Competitive,
    category: "enjoy-fiction",
    source: "suggestionData enjoy-fiction competitive #8",
    dark: true,
    prompt:
      "We're bounty hunters in the Wild West tracking the same shapeshifting outlaw worth $10,000 dead or alive...",
  },
  {
    id: "setup-kids-animal-rescue",
    playerCount: 2,
    gameMode: GameModes.Cooperative,
    category: "read-with-kids",
    source: "suggestionData read-with-kids cooperative #3",
    kids: true,
    fields: { kidAge: "7-10" },
    prompt:
      "We're the animal rescue squad saving forest friends from getting lost during the Big Storm using our different skills...",
  },
  {
    id: "setup-future-casablanca",
    playerCount: 2,
    gameMode: GameModes.Competitive,
    category: "see-your-future-self",
    source: "suggestionData see-your-future-self competitive #1",
    fields: {
      currentSituation:
        "We're Fatima (28, social worker) and Layla (29, architect) in Casablanca. Best friends since university who both fell for Youssef, a writer we met at a literary café in the medina",
      potentialChanges:
        "Both pursuing him while trying to maintain our friendship, navigating traditional family expectations about relationships and marriage",
    },
    prompt:
      "We want to feel the butterflies during Ramadan iftars where he's present, the tension when families start asking questions, and those difficult conversations over mint tea about love versus friendship...",
  },
  {
    id: "setup-flexible-soul-flat",
    playerCount: 2,
    gameMode: GameModes.CooperativeCompetitive,
    category: "flexible",
    source: "suggestionData flexible cooperativeCompetitive #1",
    prompt: "We're supernatural creatures sharing a flat while competing for human souls...",
  },
  {
    id: "setup-learn-peer-review",
    playerCount: 2,
    gameMode: GameModes.CooperativeCompetitive,
    category: "learn-something",
    source: "suggestionData learn-something cooperativeCompetitive #1",
    fields: {
      learningGoals: "Academic ethics and peer review",
      targetAudience: "college science students",
    },
    prompt:
      "We're graduate students collaborating on research while competing for publication recognition...",
  },
  // Three players
  {
    id: "setup-flexible-secret-society",
    playerCount: 3,
    gameMode: GameModes.Cooperative,
    category: "flexible",
    source: "suggestionData flexible cooperative #2",
    prompt:
      "We're the last surviving members of a secret society trying to prevent an ancient prophecy...",
  },
  {
    id: "setup-vent-berlin-flat",
    playerCount: 3,
    gameMode: GameModes.Competitive,
    category: "vent-about-reality",
    source: "suggestionData vent-about-reality competitive #1",
    fields: {
      frustration:
        "Apartment hunting where landlords demand credit scores, employment history, references, first-born children, and a detailed essay about why you deserve to pay three times what the place is worth",
    },
    prompt:
      "We're desperate apartment hunters competing for the only available flat in Berlin, using increasingly absurd tactics like bribing the landlord's cat, staging elaborate theatrical performances during viewings, and forming temporary alliances to sabotage other applicants...",
  },
  {
    id: "setup-kids-stuffed-animals",
    playerCount: 3,
    gameMode: GameModes.Cooperative,
    category: "read-with-kids",
    source: "suggestionData read-with-kids cooperative #4",
    kids: true,
    fields: { kidAge: "5-9" },
    prompt:
      "We're a collection of beloved stuffed animals who come alive to go on magical adventures together - there's Patches the gray elephant with big floppy ears, Captain Whiskers the orange tabby cat with a tiny sailor hat, Snuggles the white bunny with one ear that's shorter than the other, and Roary the golden lion with a magnificent mane...",
  },
  {
    id: "setup-pretend-cofounders",
    playerCount: 3,
    gameMode: GameModes.CooperativeCompetitive,
    category: "pretend-to-be",
    source: "suggestionData pretend-to-be cooperativeCompetitive #1",
    fields: {
      role: "startup co-founders",
      aspects:
        "building a revolutionary tech company together while navigating different visions for the company's future, equity distribution, and decision-making authority",
    },
    prompt:
      "We want to discover how shared vision and individual ambition can coexist and whether success strengthens or strains partnerships...",
  },
  {
    id: "setup-future-cocoa-farm",
    playerCount: 3,
    gameMode: GameModes.Cooperative,
    category: "see-your-future-self",
    source: "suggestionData see-your-future-self cooperative #1",
    fields: {
      currentSituation:
        "We're the Okafor siblings - Adaeze (38, London investment banker), Emeka (35, Berlin software engineer), and Ngozi (33, Cape Town doctor). We inherited the family cocoa farm in Nigeria but are scattered across three continents.",
      potentialChanges:
        "Returning to Ondo State to modernize the farm with sustainable practices and fair trade certification while managing careers remotely",
    },
    prompt:
      "We want to experience reconnecting with our roots during harvest season, introducing solar irrigation, but also dealing with unreliable internet for our remote work and family tensions about 'wasting' our education...",
  },
];

export const SETUP_PREMISES: SetupPremise[] = DRAFTS.map(
  ({ fields, prompt, kids, dark, ...rest }) => ({
    ...rest,
    premise: buildMergedPrompt(rest.category, fields ?? {}, prompt),
    tags: { kids: kids ?? false, dark: dark ?? false },
    maxTurns: DEFAULT_TURNS,
  })
);

### To manipulate and get information from the StoryState, use model classes

- Relevant model classes include Story.ts and ClientStateManager.ts, PlayerManager.ts, and ThreadManager.ts (all in shared/models directory).
- If these classes don't yet have a function to manipulate or get the required information from StoryState, add new functions to the classes.
- Don't add any complicated StoryState browsing and manipulation logic in other parts of the app.
- Keep story manipulation logic centralized in these domain models

### Checks and repairs on model replies

The game keeps what a model reply means, not only what matches an id exactly. Each repair is a `Repair` record (`server/src/game/services/textRepairs.ts`); `logRepairs` prints one `[LLM] repair` line per reply with the role, story id, turn and the count per kind (notes apart). The line carries no story text and no model-written ids; the records do, for tests and the eval.

**Beat replies** (`server/src/game/services/beatRepairs.ts`, `repairBeatReply`). `AIStoryGenerator.generateBeats` runs it on every reply, pregeneration siblings included, before `beatStep.apply`, so the beats are stored already repaired. `ChangeService` still applies exact ids only.

- Stat changes: a player stat in seat form (`player1_energy`, `player_player_energy`) is read as the plain id under that seat; a shared stat under a player moves to `shared`; in single player every player-stat change goes to player1. A player stat under `shared` in multiplayer, or a seat form under another player's group, is ambiguous and dropped; unknown stats are dropped. Both are counted.
- A `setString` value its stat's non-blank `possibleValues` don't mention is a note (`offLadderValue`); the change still applies.
- Facts: kept on `world`, a story element or an element created in the same reply. A fact filed under a stat, an outcome or a player slot becomes a world fact prefixed with the stat's name, the outcome's question or the character's name; any other id becomes an unprefixed world fact.
- Introductions of an element that neither exists nor is created in the reply are dropped.
- Milestones: the group comes from the outcome (shared first; an id held in two lists is noted). An unknown id is mapped only when exactly one ended thread's outcome has no milestone in the reply and exactly one milestone has an unknown id; otherwise it is dropped. On turns that may add milestones (`canAddMilestones` in `storyTextSteps.ts`: the ending, or a switch after the first beat), an ended thread (`Story.getResolvedThreadAnalysis()`) whose outcome got fewer milestones than threads that pushed it gets its planned `thread.milestone`; exploration threads record theirs too (`ThreadResolutionService.getMilestone`).
- Option types follow the player's phase (`expectedOptionType`): exploration at switches and in exploration threads, challenge in challenge and contest threads; the ending is untouched. A converted challenge option gets risk "normal", no bonuses, and base 0, or the fixed sacrifice / reward points.

**The roll.** `BeatResolutionService.calculateTotalPoints` counts only the first `MAX_STAT_MODIFIERS_PER_OPTION` (2) stat bonuses, each clamped to ±`MAX_STAT_MODIFIER_POINTS` (15, `core/config.ts`); the player's point breakdown shows the clamped values. Stored options keep what the model wrote, so the eval's bonus-range check still measures the model.

**Character selection.** `PlayerManager.setCharacterSelection` gives every player stat a value: a background stat the chosen background leaves out takes the stat's `initialValue`, or the template editor's default (`""`, `[]`, 50) when that is missing too. Stories already running are untouched.

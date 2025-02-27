# Feature backlog

More structured threads

- Implement success/failure calculation mechanics
  - function to determine outcome
  - expand types to store type of outcome
  - prompts to display and consider narratively types of outcomes
- Create some sort of thread/switch history in the story state. Current state design is weird.
- Add exploratory threads back in
- Add pre-defined results for the last beat of a thread so the AI doesn't screw it up
- Simplify stat changes (no statModifications as part of options after all)
- Display points and risk type in UI?

Improve generations

- Attach facts to players?
- More efficient prompts for switches/threads/beats?
  - only relevant parts
  - Context stuff first, switch/thread configurations last
  - beat planning: turn "which stats affect consequences" into "whatever affects consequences narratively"?
- adjust scope of story setup based on the number of beats
- Multi-step flow for generating a stat schema?
- Track story elements that a player has NOT been introduced to yet?
- Titles for stories (show in resume story section in Welcome screen)

Big features

- Let player choose/adjust starting position (name, pronouns, stats)
- Images: generate one for each player and story element and only use iamges from that list?
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- Select language
  - different ones for different players

User accounts

- Manage games
- Invite specific account to a player slot
- Game history

Open Source?

- Add setup and deployment instructions

---

See @ThreadPromptService.ts, @BeatPromptService, @beats.ts and @thread.ts for context about threads, switches, and beats.

General structure:

- Each beat (of types success/failure and sideA/sideB) results in a favorable/mixed/unfavorable outcome.
- The outcome is determined at random based on a probability distribution.
- The baseline distribution is 33/34/33.
- Points shifts the distribution, with 1 point representing a step from unfavorable to mixed or from mixed to favorable. It takes 50 points to get from 33/34/33 to 50/50/0.
- Beats give point bonuses and maluses. See @beats.ts for the schemas.
- Each option that the player can choose from is either normal, safe, or risky. Risky options skew the distribution toward extremes. Safe options skew the distribution away from extreme results.
- For multiplayer threads with a contested outcome, we must track how two (or more) sides are performing relative to each other. The final outcome must then favor one side or be some sort of a draw.

Example

- Possible milestones that come out of the thread: "[player] convinces [NPC] to help them find the artifact." (favorable), "[player] convinces [NPC] to help them find the artifact in exchange for 500 gold" (mixed), "[NPC] refuses to help [player] find the artifact" (unfavorable).
- Beat 1: How does [player] introduce themselves?
  Intermediate outcome: a first impression (favorable / mixed / unfavorable)
  Beat generation logic will later decide what the options, point bonuses/maluses, and actual first impressions are based on the overall story context.
- Beat 2: How does [player] try to find an opening with [NPC]?
  Intermediate outcome type: opening with [NPC] (favorable / mixed / unfavorable)
  Beat generation logic will later decide what options, probability distributions, and actual openings are (based on the result of beat 1 and the overall story context).
- Beat 3: How does [player] convince [NPC] to help them find the artifact?
  Possible outcomes are the same as for the thread overall (= the milestones, one of which will be added to the big story outcome).
  Actual options and probability distributions are again generated with the beat generation logic later.
- In Beat 1, the player chooses an option with a total of +10 points that is marked as safe. Safe turns the default 33/34/33 distribution into a 25/50/25 distribution. 10 points turn it into a 28/54/18 distrution (by taking 10 points away from the unfavorable category and splitting them between favorable and mixed results.) Randomness decides that the outcome is favorable.
- In Beat 2, the player gets 50 points because the previous beat was favorable, which is reflected in how the situation in beat 2 is narrated. They choose a risky option with -10 points. Risky turns the default distribution into 40/20/40. +40 points turn it into 60/20/20 (as many points from unfavorable to favorable as possible). Randomness decides that the outcome is mixed.
- In Beat 3, the player starts with the default distribution, because the previous beat was mixed. They choose a normal option with +10 points. They end up with a 36/38/26 distribution and roll a mixed result. The milestone "[player] convinces [NPC] to help them find the artifact in exchange for 500 gold" is added to the outcome and narrated accordingly.
- If this was a sideA vs. sideB thread, we would compare the final results of the competing sides. If they are the same, it's a mixed result (draw). If one side has a better result than the other, that side wins the contested outcome. (Same for the previous beats of the thread.)

Steps

- Adjust beat types in @beat.ts to allow us to store result types. (Use existing types if possible.) Adjust the
- In @GameQueueProcessor, when we generate beats, we have to add a new step for processing success/failure and sideA vs. sideB types of threads. Probability distributions must be calculated, results determined, stored in the players' previous beats and the thread.
- In @StoryStatePromptService.ts, we must display the type of results that players got in the thread.
- In @BeatPromptService.ts, we must ask the AI to adjust the narrative to the type of result that the players had the previous beat, with favorable results / their side winning in the previous beat making things easier in this beat.

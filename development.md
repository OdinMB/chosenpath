# Feature backlog

More structured threads

- Test with multiplayer

Clean-up

- Create some sort of thread/switch history in the story state. Current state design is weird.

  - store threat results in that new data structure (right now, in multiplayer games, it's not directly clear what the thread result is in the story state)
  - previous thread configuration must highlight the actual results of the threads
  - Simplify getCurrent/PreviousThreadBeatChoices nonsense in StoryStatePromptService

- Flavor switch / Thread generation for the final milestone of an outcome: when designing the final thread, make sure that it actually resolves the outcome!
- thinking step for each option: which stats could be relevant?
- stats: one field for narrative instructions, plus one for mechanics? (To be considered in option design and processing consequences)
- Add exploratory threads back in
- For potential results for the last beat of a thread: ask the AI to take the general milestones and make them more specific given how the thread has gone so far
- don't send client secret option details
- Simplify stat changes: no statModifications as part of options (AI doesn't use them correctly anyway); expand prompt/descriptions for stat changes to be about both making the choice and its consequences
- Allow shared outcomes only in multiplayer games?
- Attach facts to players?
- More efficient prompts for switches/threads/beats?
  - only relevant parts
  - Context stuff first, switch/thread configurations last
  - beat planning: turn "which stats affect consequences" into "whatever affects consequences narratively"?
- adjust scope of story setup based on the number of beats
- Track story elements that a player has NOT been introduced to yet

New features

- Difficulty level (affecting base points)
- Limited tokens to see option stats (costs more for later beats in a thread)
- Titles for stories (show in resume story section in Welcome screen)
- Prettier welcome/setup views with shifting images?
- Include generic story music (identify right track for each story)
- Let player choose/adjust starting position (name, pronouns, stats)
- Images: generate one for each player and story element and only use iamges from that list?
- Multi-step flow for generating a stat schema?
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- Select language
  - different ones for different players
- User accounts
  - Manage games
  - Invite specific account to a player slot
  - Game history
- Add setup and deployment instructions

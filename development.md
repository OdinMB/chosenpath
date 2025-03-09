Smaller and more commits!

# Feature backlog

Improve stat handling

- how to improve stat definitions at game init?
  - more structured considerations for narrative/mechanics? threshold_triggers, usage_bonuses, etc. etc.
  - extra LLM step just for stats?
- schema-based thinking step for each option: which stats could be relevant?
- option type enum for schemas? (temptation, resource spent, normal)

Improvements

- section: use outcomes parameter for determining both player and shared outcome display. Don't show outcomes in thread generation prompt.
- Move newMilestone changes to switch generation (away from beat generation)
- Flavor switch / Thread generation for the final milestone of an outcome: when designing the final thread, make sure that it actually resolves the outcome!
- For potential results for the last beat of a thread: ask the AI to take the general milestones and make them more specific given how the thread has gone so far
- Allow shared outcomes only in multiplayer games?
- Attach facts to players?
- adjust scope of story setup based on the number of beats
- Track story elements that a player has NOT been introduced to yet

New features

- Library of stories with pre-configured setups
- Difficulty level (affecting base points)
- Limited tokens to see option stats (costs more for later beats in a thread)
- Titles for stories (show in resume story section in Welcome screen)
- Dynamically add new outcomes, e.g. based on exploration threads.
- Prettier welcome/setup views with shifting images?
- Include generic story music (identify right track for each story)
- Let player choose/adjust starting position (name, pronouns, stats)
- Images: generate one for each player and story element and only use iamges from that list?
- Multi-step flow for generating a stat schema?
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- New switch type using this voting mechanism to decide which direction to take among several players (plus instructions for how to resolve draws)
- Select language
  - different ones for different players
- User accounts
  - Manage games
  - Invite specific account to a player slot
  - Game history
- System to view/navigate save files
- Add setup and deployment instructions

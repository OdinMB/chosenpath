Smaller and more commits!

# Feature backlog

Improve stat handling

- stats: MUST specify at which level which kinds of point benefits are awarded
- stats: can be changed after beat (how?), can be changed after thread (how?)
  - consider in beat prompt
- options: add enum for type: normal, temptation, resource sacrifice (including exploration beats)
  - show in prompts
  - consider in beat prompt
- schema-based thinking step for each option: which stats could be relevant?

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

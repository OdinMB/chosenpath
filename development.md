Smaller and more commits!

# Feature backlog

Improve stat setups and option definitions

- Redundancy in case story initiation didn't provide proper values for shared stats: use the first beat generation to set proper stat values.
- Repeat most important information at the end of beat prompts alongside switch/thread configurations (so that they gain more weight)?
- Break this whole 20-step mess down into smaller LLM interactions?
- Make prompts more concise?

New features

- Library of stories with pre-configured setups
- Images: generate one for each player and story element and only use iamges from that list?
- Difficulty level (affecting base points)
- Allow users to see some option stats like risky/safe or even modifiers / final probability distribution. Costs more for later beats in a thread.
- Prettier welcome/setup views with shifting images?
- User accounts
  - Manage games
  - Invite specific account to a player slot
  - Game history
- Dynamically add new outcomes, e.g. based on exploration threads.
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- New switch type using this voting mechanism to decide which direction to take among several players (plus instructions for how to resolve draws)
- Select language
  - different ones for different players
- Include generic story music (identify right track for each story)
- System to view/navigate save files

Improvements

- Check if ids actually exist (e.g. outcome ID)
- Retry mechanism for queue actions
- Send error messages to frontend
- For beat (non-switch/thread) resolutions, only change stats if their canBeChangedInBeatResolutions is true
- Attach facts to players
- adjust scope of story setup based on the number of beats
- Track story elements that a player has NOT been introduced to yet

- Move newMilestone changes to switch generation (away from beat generation)?
- Flavor switch / Thread generation for the final milestone of an outcome: when designing the final thread, make sure that it actually resolves the outcome!
- Allow shared outcomes only in multiplayer games?
- Add setup and deployment instructions

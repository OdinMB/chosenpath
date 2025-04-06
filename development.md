Smaller and more commits!

# Feature backlog

Next

- CoT schema attribute to list "show don't tell" elements for the beat.
- Use React routing thingy for frontend

Project structure

- /client

  - /src
    - /shared
      - /components # Shared components
        - /ui # UI primitives (buttons, modals, etc.)
      - hooks, utilities, etc.
    - /website # Website-specific code
      - /components # Website-specific components
      - /pages # Website pages
    - /game # Game-specific code
      - /components # Game-specific components
      - /services # Game services
    - /admin # Admin-specific code
      - /components # Admin-specific components
      - /services # Admin services
    - /user # User account-specific code
      - /components # User account components
      - /services # User account services

- Setting up path aliases in your tsconfig.json to make imports cleaner
- Using barrel files (index.ts) at key points to simplify imports
- Documenting the chosen structure to help onboard new team members
- Update client logging to use the new logger util

New features

- Library of stories with pre-configured setups
- User accounts
  - Manage games
  - Invite specific account to a player slot
  - Game history
- Credits system for generating stories
- See pending players, current beat, etc. of games of stored codes

  - Stripe integration

- Images: generate one for each player and story element and only use iamges from that list?
- Resolution elements
  - what about overall result in multiplayer beats?
  - thread resolutions?
- Difficulty level (affecting base points)
- Allow users to see some option stats like risky/safe or even modifiers / final probability distribution. Costs more for later beats in a thread.
- Prettier welcome/setup views with shifting images?
- Dynamically add new outcomes, e.g. based on exploration threads.
- Multiplayer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- New switch type using this voting mechanism to decide which direction to take among several players (plus instructions for how to resolve draws)
- Select language
  - different ones for different players
- Include music (OpenAI's new API)
- System to view/navigate save files

Error resilience

- Retry mechanism for queue actions
- Redundancy in case story initiation didn't provide proper values for shared stats: use the first beat generation to set proper stat values. (See getDefaultStatValue for "fix me" indicators.)
- Make sure that there are only 3 backgrounds per player, turn backgrounds into background1-3, or just delete duplicate backgrounds.
- Check if ids actually exist (e.g. outcome ID)

Improve stat setups and option definitions

- Repeat most important information at the end of beat prompts alongside switch/thread configurations (so that they gain more weight)?
- Break this whole 20-step mess down into smaller LLM interactions?

Other improvements

- For beat (non-switch/thread) resolutions, only change stats if their canBeChangedInBeatResolutions is true
- Consideration to make 2-beat threads more likely
- Attach facts to players
- adjust scope of story setup based on the number of beats
- Have the equivalent of Story on the client side
- Track story elements that a player has NOT been introduced to yet

- Move newMilestone changes to switch generation (away from beat generation)?
- Flavor switch / Thread generation for the final milestone of an outcome: when designing the final thread, make sure that it actually resolves the outcome!
- Allow shared outcomes only in multiplayer games?
- Add setup and deployment instructions

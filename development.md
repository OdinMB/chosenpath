Smaller commits!

# NEXT

- Always introduce other players in beat 1
- First thread always together
- show options of previous beats in the thread to avoid repeating any of them

# BACKLOG

## BETTER EXPERIENCE

### Big

- Different languages
- Images: generate one for each player and story element and only use iamges from that list
- Dynamically add new outcomes, e.g. based on exploration threads.
- Audio version
- Music (OpenAI's new API?)
- New multiplayer switch type using voting mechanism to decide which direction to take

### Small

- In beat resolutions that are not also thread resolutions, only change stats if their canBeChangedInBeatResolutions is true
- Consideration to make 2-beat threads more likely
- Attach facts to players
- Resolution elements
  - what about overall result in multiplayer beats?
  - thread resolutions?
- Difficulty level (affecting base points)
- Allow users to see some option stats like risky/safe or even modifiers / final probability distribution. Costs more for later beats in a thread.
- Prettier welcome/setup views with shifting images?

## SERIOUS PROJECT

### Big

- System to view/navigate save files
- User accounts
  - Manage games
  - Invite specific account to a player slot
  - Game history
- Credits system for generating stories
- Stripe integration
- Multiplayer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)

### Small

- See pending players, current beat, etc. of games of stored codes
- Use React routing thingy for frontend

## TECHNICALITIES

- Retry mechanism for queue actions
- Make sure that there are only 3 backgrounds per player / 3 options per beat
- Check if ids actually exist when changes are proposed by the AI (e.g. outcome ID)
- Separate ui from business logic in client for game/page
- adjust scope of story setup based on the number of beats
- Track story elements that a player has NOT been introduced to yet
- for generation + iteration: generate a stats = Stat[] attribute where Stat includes a "shared" vs. "player" attribute. That way, the whole zod stuff doesn't have to be sent to the servers twice.
- Move newMilestone changes to switch generation (away from beat generation)?
- Allow shared outcomes only in multiplayer games?
- Add setup and deployment instructions

Smaller commits!

# NEXT

- 1 Template AI draft doesn't seem to respect # players
- 1 Share links not working online
- 1 Always introduce other players in beat 1
- 1 First thread always together
- 2 Track options of previous beats in the thread to avoid repeating any of them
- 1 Add "what you're looking for" filters above carousel and in library (preset filters)
  - Have fun with a kid
  - Slip into a different role (Slice of Life)
  - Vent on reality (Satire)
  - Enjoy fiction (Crime, Fantasy, etc.)
- 1 Swipe feature for carousel
- 10 More multiplayer templates
- 5 Title images for templates (esp. carousel titles)

# BETTER EXPERIENCE

Text, English, Multiplayer > other stuff

- 1 In beat resolutions that are not also thread resolutions, only change stats if their canBeChangedInBeatResolutions is true
- 5 Attach facts to players
- 25 New multiplayer switch type using voting mechanism to decide which direction to take
- 3 Consideration to make 2-beat threads more likely
- 20 Images for title, player identities, story elements (for templates initially)
- 20 Dynamically add new outcomes for longer stories
- 30 Audio version
- 30 Different languages
- 10 Resolution animation elements (thread, group)
- 5 Setting to deactivate the resolution animations
- 5 Difficulty level (affecting base points)
- 10 creation/template setting: jokers to see risky/safe or even modifiers
- 20 Music (OpenAI's new API?)

# SERIOUS PROJECT

- 10 User accounts (DB, Login, Manage codes/games)
- 5 Credits system for generating stories
- 15 Stripe integration
- 5 See pending players, current beat, etc. of active games
- 15 System to view/navigate save files
- 30 Multiplayer mode: shared perspective (majority vote, lottery, voting threshold)
- 20 Use React routing for frontend

# TECHNICALITIES

- 1 Track story elements that a player has NOT been introduced to yet
- Retry mechanism for queue actions
- Make sure that there are only 3 backgrounds per player / 3 options per beat
- Check if ids actually exist when changes are proposed by the AI (e.g. outcome ID)
- Separate ui from business logic in client for game/page
- adjust scope of story setup based on the number of beats
- for generation + iteration: generate a stats = Stat[] attribute where Stat includes a "shared" vs. "player" attribute. That way, the whole zod stuff doesn't have to be sent to the servers twice.
- Move newMilestone changes to switch generation (away from beat generation)?
- Allow shared outcomes only in multiplayer games?
- Add setup and deployment instructions

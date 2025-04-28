Smaller commits!

# NEXT

- 2: Special treatment for [image] tags with id = playerslot
- 1: sort/filter stories and templates

- 7: Generating images during the story (using reference images)

- 3: Add "what you're looking for" filters above carousel and in library (preset filters) in combination with singleplayer/multiplayer switch

  - Enjoy fiction (Crime, Fantasy, etc.)
  - Pretend to be (Slice of Life)
  - Have fun with a kid
  - Vent on reality (Satire)

- 10: More (multiplayer) templates

# BETTER EXPERIENCE

Focus: Text/Images, English, Multiplayer

- 2: Setup: instructions for switches/threads (to be shown for switch/thread generation)
- 2: add support and examples for 1-beat threads
- 1: formatStatDisplay: Only show adjustmentsAfterThreads on switch beats
- 3: Stat attribute for personal stats: initial value or part of player background?
- 1: if not first beat in a thread: don't reestablish scene; go directly into action

- 20: Streaming text
- 5: higher degree of direct interaction between players in joint threads

- 5: Attach facts to players
- 25: Multiplayer switch type with voting mechanism to decide which direction to take
- 3: story setting: # paragraphs / beat (shorter for kids/roleplaying mode)
- 20: Dynamically add new outcomes for longer stories
- 5: Play with Gemini 2.5 Pro once integrated in Langchain
- 30: Audio version
  https://elevenlabs.io/docs/cookbooks/text-to-speech/streaming
- 30: Different languages
- 10: Resolution animation elements (thread, group)
- 5: Setting to deactivate the resolution animations
- 5: Difficulty level (affecting base points)
- 10: creation/template setting: jokers to see risky/safe or even modifiers
- 20: Music (OpenAI's new API?)

# SERIOUS PROJECT

- 1: export stories
- 10: User accounts (DB, Login, Manage codes/games)
- 5: Credits system for generating stories
- 15: Stripe integration
- 5: See pending players, current beat, etc. of active games
- 15: System to view/navigate save files
- 30: Multiplayer mode: shared perspective (majority vote, lottery, voting threshold)
- 20: Use React routing for frontend

# TECHNICALITIES

- 1: Track story elements that a player has NOT been introduced to yet (don't show in ClientState)
- 2: refactor templateRoutes -> route + AdminTemplateService + shared TemplateService
- Retry mechanism for queue actions
- Make sure that there are only 3 backgrounds per player / 3 options per beat
- Check if ids actually exist when changes are proposed by the AI (e.g. outcome ID)
- Separate ui from business logic in client for game/page
- adjust scope of story setup based on the number of beats
- for generation + iteration: generate a stats = Stat[] attribute where Stat includes a "shared" vs. "player" attribute. That way, the whole zod stuff doesn't have to be sent to the servers twice.
- Move newMilestone changes to switch generation (away from beat generation)?
- Allow shared outcomes only in multiplayer games?
- Add setup and deployment instructions

# NOTES

- When a thread just resolved an outcome, the options in the switch beat can still try to move the story toward this now dead end. The generated thread then ignores the player choice to focus on outcomes that are still unresolved. Which is weird given the explicit choice of the player before.

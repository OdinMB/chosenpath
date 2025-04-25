Smaller commits!

# NEXT

- 20 Images for title, player identities, story elements (for templates initially)
  https://platform.openai.com/docs/guides/image-generation?image-generation-model=gpt-image-1

- 1 Add "what you're looking for" filters above carousel and in library (preset filters)
  - Enjoy fiction (Crime, Fantasy, etc.)
  - Pretend to be (Slice of Life)
  - Have fun with a kid
  - Vent on reality (Satire)
- 10 More multiplayer templates
- 5 higher degree of direct interaction between players in joint threads

# BETTER EXPERIENCE

Text, English, Multiplayer > other stuff

- 3 Stat attribute for personal stats: initial value or part of player background?
- 5 Attach facts to players
- 25 New multiplayer switch type using voting mechanism to decide which direction to take
- 3 story setting for # paragraphs / beat (shorter for kids stories and later roleplay mode)
- 20 Dynamically add new outcomes for longer stories
- 5 Play with Gemini 2.5 Pro once integrated in Langchain
- 30 Audio version
  https://elevenlabs.io/docs/cookbooks/text-to-speech/streaming
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

# NOTES

- When a thread just resolved an outcome, the options in the switch beat can still try to move the story toward this now dead end. The generated thread then ignores the player choice to focus on outcomes that are still unresolved. Which is weird given the explicit choice of the player before.

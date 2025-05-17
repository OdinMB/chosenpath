Smaller commits!

# NEXT

- 2: See pending players, current beat, etc. of active games
- 2: Prettier (basic) user view
- 2: account header bar at the top. Show # MP stories in which user is pending.

- 2: Generate images for AI-generated stories
- 1: Check issue with image references in interludes
- 1: delete codes on story generation any error (with deleteCodeSetsByContent(codes))
- 2: protect image generation endpoints against abuse

# BETTER EXPERIENCE

Focus: Text/Images, English, Multiplayer

- 5: Difficulty level (affecting base points)

- 10: More (multiplayer) templates (try to make 1-3 players work)
- 4: for templates: additional images that are not attached to a story element
- 1: percentage stats at 0%: name not visible
- 2: add support and examples for 1-beat threads

- 10: system for triggering events / twists / etc. at certain points during the story

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
- 10: Create story based on kids' drawings
- 10: creation/template setting: jokers to see risky/safe or even modifiers
- 20: Music (OpenAI's new API?)
- 20: Streaming text

# SERIOUS PROJECT

- 1: Export stories
- 2: Users: transfer local games to cloud (requires stories db)
- 5: Admin: iterate on existing images by using them as reference images (new action icon)
- 5: Credits system for generating stories
- 15: Stripe integration
- 15: System to view/navigate save files
- 7: system to add useful images generated in template-based stories to the template
- 30: Multiplayer mode: shared perspective (majority vote, lottery, voting threshold)
- 20: Use React routing for frontend

# TECHNICALITIES

- 1: Track story elements that a player has NOT been introduced to yet (don't show in ClientState)
- 2: refactor templateRoutes -> route + AdminTemplateService + shared TemplateService
- Retry mechanism for queue actions
- Make sure that there are only 3 backgrounds per player / 3 options per beat
- Check if ids actually exist when changes are proposed by the AI (e.g. outcome ID)
- Separate ui from business logic in client for game/page
- for generation + iteration: generate a stats = Stat[] attribute where Stat includes a "shared" vs. "player" attribute. That way, the whole zod stuff doesn't have to be sent to the servers twice.
- Move newMilestone changes to switch generation (away from beat generation)?
- Add setup and deployment instructions
- 1: zipTemplateUtils.ts still has a direct fetch command (instead of apiClient)

# NOTES

- When a thread just resolved an outcome, the options in the switch beat can still try to move the story toward this now dead end. The generated thread then ignores the player choice to focus on outcomes that are still unresolved. Which is weird given the explicit choice of the player before.

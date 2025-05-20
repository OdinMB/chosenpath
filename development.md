Smaller commits!

# NEXT

- 2: Add difficulties to existing templates
- 1: modifier tags not centered if linebreak
- 2: Generate images for AI-generated stories

- 1: simple Credits page

Montserrat[wght].ttf: Copyright 2011 The Montserrat Project Authors (https://github.com/JulietaUla/Montserrat)

Lora[wght].ttf: Copyright 2011 The Lora Project Authors (https://github.com/cyrealtype/Lora-Cyrillic), with Reserved Font Name "Lora".

- 1: resumable stories: spinner when loading page afresh (when?)
- 1: Check issue with image references in interludes
- 1: story feed updates: every once in a while IF >= 1 multiplayer story with at least 1 pending other player
- 2: Feedback: move away from Google App Script

# BETTER EXPERIENCE

Focus: Text/Images, English, Multiplayer

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
- 5: Admin: iterate on existing images by using them as reference images (new action icon)
- 4: Images: thumbnail versions (especially for cover images); load full version in modals
- 5: Credits system for generating stories
- 15: Stripe integration
- 15: System to view/navigate save files
- 3: users can lock codes to then require this user to be logged in to be used
- 7: system to add useful images generated in template-based stories to the template
- 30: Multiplayer mode: shared perspective (majority vote, lottery, voting threshold)
- 20: Use React routing for frontend

# TECHNICALITIES

- 1: Track story elements that a player has NOT been introduced to yet (don't show in ClientState)
- 2: refactor templateRoutes -> route + AdminTemplateService + shared TemplateService
- Retry mechanism for queue actions
- Check if ids actually exist when changes are proposed by the AI (e.g. outcome ID)
- 2: rate limit via express-rate-limit library
- Separate ui from business logic in client for game/page
- for generation + iteration: generate a stats = Stat[] attribute where Stat includes a "shared" vs. "player" attribute. That way, the whole zod stuff doesn't have to be sent to the servers twice.
- Move newMilestone changes to switch generation (away from beat generation)?
- Add setup and deployment instructions

# NOTES

- When a thread just resolved an outcome, the options in the switch beat can still try to move the story toward this now dead end. The generated thread then ignores the player choice to focus on outcomes that are still unresolved. Which is weird given the explicit choice of the player before.

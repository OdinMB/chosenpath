Smaller commits!

# NEXT

- 2: users should not have to worry about IDs (elements, stats). Do what we do for Outcomes (whatever that is)?
- 1: Teaser should be properly generated, not copy/pasted from user query

- 1: resolution animation: good outcomes on the right (as opposed to left)
- 1: resolution animation: sometimes, stat ids are shown, as opposed to stat names
- 1: fix tooltip to not go beyond display borders
- 1: bigger warning AI draft over existing world
- 1: on image generation error: give better notes (copyright etc.)
- 1: content moderation: add copyright issues

- 4: custom rules for templates/stories (rename setting rules) for things like "all options must always be git commands", "no challenge threads ever", etc.
- 3: setting options: how much text per beat (paragraphs, level of detail per paragraph?)
- 2: meet future self should only have one possible identity

- 1: when linking a locally stored story code to an account, check if that code already belongs to another account
- 1: for logged-in users: when creating a new story via Page: do you want a one-off story or edit the World?
- 2: review process for storytellers who want to publish on website
- ?: Bild bei Draft mit hochladen (especially for kids stories)

Browser tests

- 1: why does Safari not show images in template editor?
- 1: why does Brave browser not respect background color?
- 1: Brave doesn't break up paragraphs in frontend fix logic

# BETTER EXPERIENCE

Focus: Text/Images, English, Multiplayer

- 10: More (multiplayer) templates (try to make 1-3 players work)
- 4: for templates: additional images that are not attached to a story element
- 2: add support and examples for 1-beat threads

- 10: system for triggering events / twists / etc. at certain points during the story

- 5: higher degree of direct interaction between players in joint threads

- 5: Attach facts to players
- 25: Multiplayer switch type with voting mechanism to decide which direction to take
- 3: story setting: # paragraphs / beat (shorter for kids/roleplaying mode)
- 20: Dynamically add new outcomes for longer stories
- 30: Audio version
  https://elevenlabs.io/docs/cookbooks/text-to-speech/streaming
- 30: Different languages
- 10: Resolution animation elements (thread, group)
- 2: Setting to deactivate the resolution animations
- 10: Create story based on kids' drawings
- 10: creation/template setting: jokers to see risky/safe or even modifiers
- 20: Music (OpenAI's new API?)

# SERIOUS PROJECT

- 1: Export stories
- ?: Für Worldbuilders: Lizenz-Auswahl
- 5: Barrierefreiheit (try eye-able.com)
- 5: Admin: iterate on existing images by using them as reference images (new action icon)
- 4: Images: thumbnail versions (especially for cover images); load full version in modals
- 5: Credits system for generating stories
- 15: Stripe / checkout.com integration
- ?: Eigene Bilder hochladen (für Elemente)
- ?: iFrame whitelabel?
- 10: template image handling: more flexible than binary yes (assumes images for all elements) vs. no (no template images used at all)
- 15: System to view/navigate save files
- 3: users can lock codes to then require this user to be logged in to be used
- 7: system to add useful images from stories to the underlying template
- 30: Multiplayer mode: shared perspective (majority vote, lottery, voting threshold)

# MOBILE APPS

My Updated Recommendation: Expo with Web Support
This approach gives you the best of both worlds:
Migration Strategy
Phase 1: Setup Expo Universal App
Apply to development....
Run
Phase 2: Gradual Migration
Move shared code to universal app
Create platform-aware components:
Apply to development....
Adapt navigation:
Apply to development....
Phase 3: Platform-Specific Optimization
Apply to development....
Key Benefits for Your Situation
Your existing web app logic (contexts, hooks, services) can be copied almost verbatim
WebSocket service will work unchanged
API client needs minimal changes
Game state management transfers directly
Single deployment pipeline for all platforms
Code Reuse Reality Check
With this approach:
Business logic: ~98% reuse
API/WebSocket code: ~95% reuse
UI components: ~60-70% reuse (platform differences)
Navigation: ~80% reuse (similar concepts)
Overall: ~85-90% code reuse
Migration Path
Week 1-2: Set up Expo universal app
Week 3-4: Move your shared/ folder logic
Week 5-6: Recreate key UI components for mobile
Week 7-8: Get basic mobile app working
Week 9+: Add mobile-specific features and polish
Would you like me to help you set up the initial Expo universal app structure and show you how to migrate your first shared components?

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

- Flesh out success/failure + luck/mastery: in kinda bad starting positions, success should be characterized as lucky. A master who fails should fail because something got in the way, not because they're bad. Etc.
- Idea: On failures, allow players to pick the outcome
  You failed your check to fight back against the goblins? Alright, where do they hurt you? What happens now? This can even be tied in with a narrative currency system. You fail, yes. Now you get to pick an outcome. But if have failed many times before, you have enough ‘Hard Lessons’ to buy the best of these bad outcomes.
- Idea: Input randomness. Results are clear, but which options are offered is dictated by randomness.
- Idea: Choosing resolutions. Set of favorable/mixed/unfavorable resolution tokens that the player can spend throughout the story.
- When a thread just resolved an outcome, the options in the switch beat can still try to move the story toward this now dead end. The generated thread then ignores the player choice to focus on outcomes that are still unresolved. Which is weird given the explicit choice of the player before.

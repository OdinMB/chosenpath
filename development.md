Smaller commits!

# NEXT

- 4: in pre-defined worlds, stories can have their first beat for each identity/background combination pre-defined, such that there are never any waiting times for the player.
- 4: custom rules for templates/stories (rename setting rules) for things like "all options must always be git commands", "no challenge threads ever", etc.
- 3: setting options: how much text per beat (paragraphs, level of detail per paragraph?)
- 2: meet future self should only have one possible identity

- 2: review process for storytellers who want to publish on website
- ?: Bild bei Draft mit hochladen (especially for kids stories)

Browser tests

- check if solved: Safari doesn't show category images
- 1: why does Brave browser not respect background color?
- 1: Brave doesn't break up paragraphs in frontend fix logic

# GPT-6 TEXT FOLLOW-UPS

Details: DOCS/2026-09-26_gpt6-text-eval/2026-10-02_status.md (sections 4-6, 9) and the decision log .plans/2026-09-26_build-followup.md

- 3: late "aftermath" chapters replay outcomes that are already complete and give them a third milestone, which can reverse one (space pirates 22-26, estate agents 17-21)
- 3: a shared relationship outcome is played by one player at a time under the shared-scenes rule and settled by messages (estate agents 6-21); decide whether two players who share it may share a thread when only one picked it
- 3: chapter planner: a one-sided contest stage's planned scene holds the other camp (space pirates 6-8), and two threads get planned in one room (estate agents 13-15); a plan check for one character in two scenes, and telling the planner each seat's camp
- 2: group turns restate the same caveats turn after turn ("documented versus unexplained" in 19 of 26 estate agents turns)
- 1: drop a reward offered on a stat already at its top step (four group rewards paid nothing in space pirates); lever reader should match part of a name or held item and never fall back to a stat that allows no lever
- 3: learning stories: the lemonade stand never reaches its core activity (selling) in 10 turns
- 2: pronouns as the setup names them: the kids story calls Pip, set up as they/them, "he"
- 2: group options still told apart by risk alone where the stats give no bonus in the scene (space pirates); a base-point scale was never measured for groups
- 1: the money turn line for learning stories rests on thin evidence (passes only with the case picked because production failed it); watch the money in learning stories, re-measure or revert
- 1: watch the single-player chapter-ending output limit (7,500 tokens): one kids turn used 6,926; a cut costs about 30 s and a retry
- 3: single-player chapter-ending turns sometimes reason until cut off; cause unknown, only contained by the lower limit and the retry
- 1: chapter plans: a reworded copy of the last step still plays the moment twice; the plan check drops only exact copies
- 2: contest edge cases the plan check still refuses: a cooperative thread with players on side B but no contest results, and a single player's contest results
- 1: confirm or undo the eval's adoption calls: contest steps compare each side's average result, shared scenes at a chapter's opening only, the money turn line, and those listed in the 1 October status section 9
- 3: held forms never rated: prose rules (B5), switch turns as scenes (B7) and the ending format (B8) on turns-r2.html, the group script (B10b) on turns-groups.html, and the cached request form (B9, 18% cheaper); each needs a rebuild and a paid check to join
- 1: rate turns-options.html (45 min): the single-player option form in production since 1 October
- 1: setups name stats "… Energy" (2 of 6 final-check setups, 2 of 4 kids setups); a fix is an untested sentence plus a retest
- 2: fix the 10 Dependabot vulnerabilities on main and process the open Dependabot branches
- 1: process the five untracked .plans/*-followup.md files from other runs with /review-followup

# BETTER EXPERIENCE

Focus: Text/Images, English, Multiplayer

- 10: More (multiplayer) templates (try to make 1-3 players work)
- 4: for templates: additional images that are not attached to a story element
- 2: add support and examples for 1-beat threads

- 10: system for triggering events / twists / etc. at certain points during the story

- 5: higher degree of direct interaction between players in joint threads

- 5: Attach facts to players
- 25: Multiplayer switch type with voting mechanism to decide which direction to take
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

# Feature backlog

Improve generations

- Save prompt context for switches/threads/beats?
- Update the thread's plan with each beat?
- Attach facts to players?
- adjust scope of story setup based on the number of beats
- Multi-step flow for generating a stat schema?

Easy nice-to-haves

- Titles for stories (show in resume story section in Welcome screen)

Big features

- Let player choose/adjust starting position (name, pronouns, stats)
- Queue processor to avoid conflicts between player actions
- Multiplaer mode: shared perspective
  - majority vote
  - lottery
  - setting for % players who must have voted to continue)
- Select language
  - different ones for different players

User accounts

- Manage games
- Invite specific account to a player slot
- Game history

Open Source?

- Add setup and deployment instructions

# Queue processor

I want to implement a queue-based state management system for my multiplayer story game. The requirements are:

Each game needs a queue processor that:

- Handles state modifications synchronously within each operation
- Can process async operations (like AI generation) safely
- Maintains game state consistency
- Automatically restarts if it crashes

Initial operations to support (based on existing code)

- Record player choice
- Generate images
- Basic error handling

The implementation should:

- Work with the existing WebSocket architecture
- Work with the existing in-memory/file-based story state management
- Be easy to extend with new operation types
- Be ready to migrate to proper databases later

Please help me implement this step by step, starting with the basic queue manager structure and then adding operations one by one.

Current relevant code includes:
server/src/handlers/GameHandler.ts
server/src/services/AIStoryGenerator.ts
server/src/websocket/index.ts (WebSocket handling)
server/src/services/SessionService.ts
server/src/services/StoryStateManager.ts

Answers to questions you asked me in a separate chat:

1. State consistency: Could we just keep a single interface to the state via StorySTateManager.ts, which will keep handling the in-memory + file-based state management? I like having both in-memory and file-based for speed and scalability.

2. Operation priority: So far, no actions must take priority. The key loop is: all players make their choices for this round, app performs all kinds of updates to the game state, we wait for players to make choices again.

3. Yes, let's try to resume incomplete operations. And yes, let's send error messages to players.

4. Concurrency. Operations within one game must be performed strictly in order. Different games can be processed in parallel. Some operations (like generating AI images) are non-conflicting and can be processed in parallel. State updates are only broadcast when they're done in the backend. (For player choices, we first acknowledge the registration of the choice so that UI's can update the list of pending players, and then broadcast an update when the next story beat is available.) Let's keep it that way for now. (The frontend will just assume that stuff is processing if that is what the should be doing given the game state that the client is aware of, and if no error messages have been coming in.)

We already created QueueProcessor.ts, which handles generic queue processing logic.
We already created queue.ts, which defines based types and schemas.

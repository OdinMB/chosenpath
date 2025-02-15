# Feature backlog

Easy nice-to-haves

- Config option for game setup: cooperative (only shared outcomes), competitive (only individual and in part conflictiog outcomes), both shared and individual outcomes
- Suggested prompts based on number of players and type of setup (cooperative etc.)
- Titles for stories (show in resume story section in Welcome screen)

Big features

- Queue processor to avoid conflicts between player actions
- Multiplaer mode: shared perspective
  -- majority vote
  -- lottery
  -- setting for % players who must have voted to continue)
- Select language
  -- different ones for different players
- Let player choose/adjust starting position (name, pronouns, stats)

User accounts

- Manage games
- Invite specific account to a player slot
- Game history

Open Source?

- Add setup and deployment instructions

# Queue processor

I want to implement a queue-based state management system for my multiplayer story game. The requirements are:
Each game needs a queue processor that:
Handles state modifications synchronously within each operation
Can process async operations (like AI generation) safely
Maintains game state consistency
Automatically restarts if it crashes

Game states need persistence:
In-memory for active games
File-based backup for crash recovery and continuing games at a later point
Periodic saving of active games
Archive completed games

Initial operations to support:
Record player choice
Generate next beat (async AI operation)
Basic error handling

The implementation should:
Work with the existing WebSocket architecture
Be easy to test
Be easy to extend with new operation types
Be ready to migrate to proper databases later

Please help me implement this step by step, starting with the basic queue manager structure and then adding operations one by one.

Current relevant code is in:
server/src/services/StoryService.ts (story state management)
server/src/websocket/index.ts (WebSocket handling)
server/src/services/SessionService.ts (current in-memory session storage)

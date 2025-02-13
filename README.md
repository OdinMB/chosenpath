# ToDo

Fill with setup instructions with AI

# Multiplayer schemas

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

# Feature backlog

- Queue processor to prepare for multiplayer
- Multiplaer modes: shared perspective (majority vote, lottery), separate characters (cooperative, both shared and individual goals, competitive)
- Select language (different ones for different players)
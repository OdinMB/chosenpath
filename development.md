# Feature backlog

Improve generations

- world elements (npcs, locations, etc.)
--- more details
--- for each player: save which ones have been introduced
--- give instructions for how to introduce elements
--- facts can be added to elements
--- if a stat refers to something, that something must exist as an element

- chapters
--- set of beats
--- attributes: title, description, outcome/potential milestones, player slots linked to the chapter
--- assign milestones only after chapters
--- players in a chapter get the same beat (but different options)
--- separate chapter generation prompt
--- planning on both chapter and beat level

- outcomes
--- add attribute for why it's impportant for the player (or group of players if shared)
--- add shared outcomes

- writig
--- Special prompt for the first beat
--- changes: consider how the player feels/reacts

- Multi-step flow for generating a stat schema?
- General writing instructions? (already much better with gpt-4o compared to o3-mini)

Easy nice-to-haves

- Titles for stories (show in resume story section in Welcome screen)

Big features

- Let player choose/adjust starting position (name, pronouns, stats)
- Queue processor to avoid conflicts between player actions
- Multiplaer mode: shared perspective
  -- majority vote
  -- lottery
  -- setting for % players who must have voted to continue)
- Select language
  -- different ones for different players

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

Current relevant code includes:
server/src/services/StoryService.ts (story state management)
server/src/websocket/index.ts (WebSocket handling)
server/src/services/SessionService.ts (current in-memory session storage)

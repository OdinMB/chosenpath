Title: Non-blocking Image Generation (Current Implementation)

Context

- Broadcast new story states immediately; generate images in background; clients show placeholders until images arrive.
- Image generation never mutates story state directly; it writes files and uses a lightweight queue operation to attach results.

Current server implementation

- Latest-beat requests only: After any progression (generated or pregen-adopted), the server collects image requests from the latest beat for each player and filters out requests whose `id` already exists in the story image library.
- Parallel generation: For each collected request, the server generates the image in the background (no story mutation), then enqueues `attachImageToStory { imageId, caption }` on completion to safely update the story via the per-story queue.
- Idempotent attach: If an image with the same id already exists, attach is effectively a no-op at the story state level (client may still fetch by URL).

Server flows that trigger image generation

1. moveStoryForward (real progression)

- Compute the next beats (or adopt a pregen) and immediately broadcast the final story.
- Run the unified image flow:
  - Collect latest-beat image requests for each player.
  - Filter out requests whose `id` already exists in `story.images`.
  - For each remaining request, generate the image and enqueue `attachImageToStory { imageId, caption }` on completion.

2. recordChoice with complete pregen (no moveStoryForward queued)

- After adopting a pregen story, the server broadcasts the new story.
- Then it runs the exact same unified image flow described above.

Attach image operation

- `attachImageToStory` loads the latest story, adds the image metadata (id, description, source=story), stores, and broadcasts.
- No mirroring into pregenerated files is needed. When pregens are stored/used, the live story image library is merged into them to avoid losing references.

Storage and URLs

- Images are written to: `/images/stories/:storyId/(subDir/)?imageId.jpeg`.
- Clients render placeholders until the image is available at its deterministic URL.

Notes

- Pregeneration never generates images; only real progression paths trigger generation.
- Character images (during selection) follow the same background generation pattern, but are not inserted into the story’s image library.

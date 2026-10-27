# API Documentation

This document describes the HTTP and WebSocket APIs available in the Chosen Path application, focusing on non-admin endpoints.

## Base URL

- **Production**: `https://api.chosenpath.ai`
- **Development**: `http://localhost:3000`

All API routes are prefixed with `/api` (handled by the server router).

## Authentication

### Cookie-Based Authentication

The API uses HTTP-only cookies for authentication:

- **Cookie Name**: `authToken`
- **Type**: JWT token
- **HttpOnly**: Yes
- **Secure**: Yes (production only)
- **SameSite**: `none` (production) / `lax` (development)

### CSRF Token

Every request other than GET, HEAD or OPTIONS must send the `XSRF-TOKEN` cookie's value in an `X-CSRF-TOKEN` header. Otherwise the server answers `403` with `{ status: "error", errorMessage: "Invalid CSRF token" }` (`CSRF_FAILURE_MESSAGE` in `core/types/api.ts`). The client retries such a request once when the cookie holds a newer token. Details in `.context/security.md`.

### Request ID

All requests should include a `requestId` parameter (query param for GET, body param for POST/PUT/DELETE) for request tracking and logging.

## Response Format

### Success Response

```typescript
{
  success: true,
  data: { ... },
  requestId: string
}
```

### Error Response

```typescript
{
  success: false,
  error: string,
  requestId: string
}
```

### Rate Limit Response

```typescript
{
  success: false,
  error: string,
  requestId: string,
  rateLimitInfo: {
    retryAfter: number,  // seconds until retry allowed
    limit: number,       // requests allowed per window
    window: number       // time window in seconds
  }
}
```

### Moderation Blocked Response

```typescript
{
  success: false,
  error: "Content moderation failed",
  requestId: string,
  moderationInfo: {
    action: "generate_template" | "iterate_template" | "initialize_story",
    reason: string,
    prompt?: string
  }
}
```

---

## Authentication Endpoints

### Register User

**POST** `/auth/register`

Create a new user account.

**Rate Limit**: `register`, per address, 3 per 24 hours; only a created account counts

**Request Body:**

```typescript
{
  email: string,
  username: string,
  password: string,  // Min 8 chars, must meet 3 of: lowercase, uppercase, number, special char
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    user: {
      id: string,
      email: string,
      username: string,
      roleId: string,
      permissions: string[]
    }
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Email already in use, username taken, or invalid password
- `429`: Rate limit exceeded
- `500`: Registration failed

---

### Login

**POST** `/auth/login`

Authenticate user and receive auth cookie.

**Rate Limit**: `login`, per address, 20 failed logins per 15 minutes; a successful login doesn't count. Over it: `429`, and the password isn't checked.

**Request Body:**

```typescript
{
  email: string,
  password: string,
  rememberMe?: boolean,  // Extends token expiration
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    user: {
      id: string,
      email: string,
      username: string,
      roleId: string,
      permissions: string[]
    }
  },
  requestId: string
}
```

Sets `authToken` cookie with expiration based on `rememberMe`.

**Error Cases:**

- `400`: Missing email or password
- `401`: Invalid credentials
- `429`: Rate limit exceeded

---

### Logout

**POST** `/auth/logout`

**Auth Required**: Yes

Invalidate current session and clear auth cookie.

**Request Body:**

```typescript
{
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    message: "Logged out successfully"
  },
  requestId: string
}
```

---

### Get Current User

**GET** `/auth/me`

Get current authenticated user information.

**Auth Required**: No (returns null if not authenticated)

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    user: {
      id: string,
      email: string,
      username: string,
      roleId: string,
      permissions: string[]
    } | null
  },
  requestId: string
}
```

---

### Update Password

**POST** `/auth/password`

**Auth Required**: Yes (regular users only, not guest accounts)

Change user password.

**Request Body:**

```typescript
{
  currentPassword: string,
  newPassword: string,  // Min 8 characters
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    message: "Password updated successfully"
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Current password incorrect or new password too short
- `401`: Authentication required

---

### Refresh Token Permissions

**POST** `/auth/refresh-permissions`

**Auth Required**: Yes

Refresh JWT token with updated user permissions.

**Request Body:**

```typescript
{
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    user: {
      id: string,
      email: string,
      username: string,
      roleId: string,
      permissions: string[]
    }
  },
  requestId: string
}
```

Updates `authToken` cookie with new token containing latest permissions.

---

## User Story Management

### Get Story Feed

**GET** `/users/stories/feed`

**Auth Required**: No (optional)

Get stories for current user or based on client story codes.

**Query Params:**

- `clientStoryCodes` (optional): Comma-separated story codes
- `status` (optional): `"active"` or `"archived"` (default: `"active"`)
- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    stories: Array<{
      storyId: string,
      code: string,
      title: string,
      teaser: string,
      playerSlot: number,
      playerName: string,
      lastPlayedAt: string,
      createdAt: string,
      status: "active" | "archived",
      gameMode: string,
      difficultyLevel?: {
        title: string,
        modifier: number
      }
    }>
  },
  requestId: string
}
```

---

### Get Created Stories

**GET** `/users/stories/created`

**Auth Required**: Yes

The signed-in user's newest 50 created stories, newest first, each with every seat and its code, so seat cards can be printed on any device (`/users/seat-cards`).

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:** `GetUserStoryFeedResponse` (`core/types/api.ts`): `{ stories: ExtendedStoryMetadata[] }`, each story's `players` holding every seat's code.

**Error Cases:**

- `401`: Authentication required
- `500`: Failed to get your stories

---

### Link Story Code

**POST** `/users/stories/link`

**Auth Required**: Yes

Link a story code to authenticated user account.

**Request Body:**

```typescript
{
  code: string,  // Story access code
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    success: true,
    storyId: string,
    playerSlot: number
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Invalid code or code already linked to another account
- `401`: Authentication required

---

## Story Management

### Create Story

**POST** `/stories`

**Auth Required**: No (optional, associates story with user if authenticated)

**Rate Limit**: Signed out, `initialize_story` per address; signed in, `initialize_story_text` or `initialize_story_images` per account, by `generateImages` (`server/src/shared/limitPolicy.ts`). Counted when the start is let through, before the spend ceiling is read; a start the ceiling refuses counts nothing. A premise the content filter refuses stays counted (the filter is an AI call).

**Spend ceiling**: refused with a `503` once today's spend ceiling for its kind of story (signed in or not) is reached, checked after the rate limit: a `429` comes before a `503`.

Create a new story from a prompt.

**Request Body:**

```typescript
{
  prompt: string,
  playerCount: 1 | 2 | 3 | 4,
  maxTurns: number,
  generateImages: boolean,
  pregenerateBeats?: boolean,  // Default: false
  gameMode: "adventure" | "mystery" | "educational",
  difficultyLevel?: {
    title: string,
    modifier: number  // If equals DEFAULT_SELECTED_DIFFICULTY_MODIFIER, AI chooses
  },
  category?: StoryCategory,  // setup category (core STORY_CATEGORIES); unknown values are dropped. "read-with-kids" gets stricter image moderation
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    storyId: string,
    codes: string[],  // Access codes for each player
    status: "queued"  // Story generation queued, use /stories/:id/status to check progress
  },
  requestId: string
}
```

Story is generated asynchronously. Client should poll `/stories/:id/status` until it is `ready` or `failed` (a setup that fails for good is reported there, not here).

**Error Cases:**

- `400`: The premise was blocked by content moderation (checked before anything is queued, so a refusal never shows up as a failed setup)
- `429`: Rate limit exceeded
- `500`: Story creation failed, including when the content filter was unavailable (it fails closed)
- `503`: Today's spend ceiling is reached; the error message is `SPEND_CEILING_MESSAGE` (`core/types/api.ts`)

---

### Create Story from Template

**POST** `/stories/template`

**Auth Required**: No (optional)

**Rate Limit**: As for Create Story; a start the creation refuses (`404` no such template, either `400` refusal listed below, `500` a failed write) counts nothing.

**Spend ceiling**: As for Create Story (`503`)

Create a story from an existing template.

**Request Body:**

```typescript
{
  templateId: string,
  playerCount: 1 | 2 | 3 | 4,
  maxTurns: number,
  generateImages: boolean,
  pregenerateBeats?: boolean,  // Default: false
  difficultyLevel?: {
    title: string,
    modifier: number
  },
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    storyId: string,
    codes: string[],
    status: "ready"  // Template-based stories are ready immediately
  },
  requestId: string
}
```

Template-based stories are created synchronously and are ready immediately (no polling needed).

**Error Cases:**

- `400`: Player count outside the template's limits, or the template can't start a story for that many players (no outcomes on the shared list or the seats in play, or a multiplayer story without a shared outcome; `core/utils/outcomeReadiness.ts`)
- `404`: Template not found
- `429`: Rate limit exceeded
- `500`: Story creation failed
- `503`: Today's spend ceiling is reached (`SPEND_CEILING_MESSAGE`)

---

### Get Starts Left

**GET** `/stories/starts-left`

**Auth Required**: Yes (`401` otherwise, and nothing is read)

The signed-in account's own story starts without images: how many it can still make under `initialize_story_text` and when its allowance renews. "Start several stories at once" on a World's settings shows it before Start is pressed (`client/src/page/hooks/useStartsLeft.ts`). Its starts are always text-only, so the count is the one its starts claim from (`storyStartLimit` in `server/src/shared/limitPolicy.ts`).

Reading counts no start and starts no window (`peekRateLimit` in `server/src/shared/rateLimiter.ts`), so it never moves when the allowance renews. It answers the caller's own count only, and nothing else about the account.

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:** `StartsLeftInfo` (`core/types/api.ts`)

```typescript
{
  success: true,
  data: {
    remaining: number,          // starts left before the allowance renews
    limit: number,              // starts per window (RATE_LIMITS.initialize_story_text.maxRequests)
    windowMs: number,           // the window's length
    resetsInMs: number | null   // until the running window ends and the whole allowance is back; null while none runs
  },
  requestId: string
}
```

The window starts with the account's first counted start, so before any start `remaining` equals `limit` and `resetsInMs` is `null`. The time is relative, so the client places it on its own clock.

**Error Cases:**

- `401`: Authentication required

---

### Check Story Code

**GET** `/stories/:code/exists`

Whether a seat code names a story, for the home page's join form (`client/src/page/utils/joinByCode.ts`). Answers `200` either way and never says which story.

**Rate Limit**: `verify_code` per address, counting misses only (`limitFailures`), as a wrong code on the game page does

**Path Params:**

- `code`: Seat code

**Response:**

```typescript
{
  success: true,
  data: {
    exists: boolean  // CodeExistsInfo
  },
  requestId: string
}
```

**Error Cases:**

- `429`: Rate limit exceeded (too many codes that named no story)
- `500`: Failed to check the story code

---

### Check Story Status

**GET** `/stories/:id/status`

Check the setup status of a story (`StoryStatusInfo`, `core/types/api.ts`).

**Path Params:**

- `id`: Story ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    status: "queued" | "ready" | "failed",
    reason?: "setup_failed" | "setup_lost"  // only with "failed"
  },
  requestId: string
}
```

- `ready`: the story's state is stored (template stories always are).
- `queued`: this server is still generating the setup.
- `failed` / `setup_failed`: the setup failed for good after the retries (the model call's own, and one more sample when the setup can't start); its DB entries are deleted.
- `failed` / `setup_lost`: neither stored nor being set up here, e.g. the server restarted mid-setup. Setups live in the server process (`server/src/stories/setupStatus.ts`; failures kept for the latest 5,000 ids, older ones read as lost).

The client (`useStoryCreation`, `page/hooks/storyStatusPolling.ts`) stops polling on `ready` or `failed`, and after three failed requests in a row; on a failure it shows "We couldn't create this story. Please try again." with Try again (the same request) and Back (the form).

---

### Update Story Status

**PUT** `/stories/status`

**Auth Required**: Yes

Archive or unarchive a story for the current user.

**Request Body:**

```typescript
{
  storyId: string,
  playerSlot: number,
  status: "active" | "archived",
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    success: true
  },
  requestId: string
}
```

**Error Cases:**

- `401`: Authentication required
- `403`: User doesn't have permission to update this story

---

## Template Endpoints

### Get Published Templates

**GET** `/templates/published`

Get all published template metadata (public access).

**Query Params:**

- `forWelcomeScreen` (optional): `"true"` to get only carousel templates
- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    templates: Array<{
      id: string,
      title: string,
      teaser: string,
      gameMode: string,
      tags: string[],
      playerCountMin: 1 | 2 | 3 | 4,
      playerCountMax: 1 | 2 | 3 | 4,
      maxTurnsMin: number,
      maxTurnsMax: number,
      difficultyLevels: Array<{
        title: string,
        modifier: number
      }>,
      publicationStatus: "published",
      showOnWelcomeScreen: boolean,
      order: number,
      containsImages: boolean,
      createdAt: string,
      updatedAt: string,
      creatorUsername?: string
    }>
  },
  requestId: string
}
```

---

### Get User Templates

**GET** `/templates/user`

**Auth Required**: Yes

Get templates created by the current user.

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    templates: Array<TemplateMetadata>  // Includes creatorId
  },
  requestId: string
}
```

---

### Get Templates by User ID

**GET** `/templates/user/:userId`

**Auth Required**: Yes

Get templates for a specific user (requires `templates_see_all` permission for other users).

**Path Params:**

- `userId`: User ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    templates: Array<TemplateMetadata>
  },
  requestId: string
}
```

---

### Get All Templates

**GET** `/templates`

**Auth Required**: Yes

**Permission Required**: `templates_see_all`

Get all template metadata (admin endpoint).

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    templates: Array<TemplateMetadata>
  },
  requestId: string
}
```

---

### Get Template by ID

**GET** `/templates/:id`

**Auth Required**: No (optional; a draft or review template needs its creator or an admin)

Get template metadata by ID, for the World page (`/templates/:id/configure`). Published and private templates answer everyone alike, without creator info. A draft or review template opens only for its creator and for users with `templates_see_all` (admins): the answer then includes `creatorId` and `creatorUsername` and is sent with `Cache-Control: private, no-store`. Everyone else gets the same `401`, signed in or not; a bad or expired sign-in counts as none.

**Path Params:**

- `id`: Template ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    template: TemplateMetadata
  },
  requestId: string
}
```

**Error Cases:**

- `401`: Authentication required (a draft or review template, for anyone but its creator or an admin)
- `404`: Template not found

---

### Get Full Template Content

**GET** `/templates/full/:id`

**Auth Required**: Yes

**Permission Check**: Edit access required

Get complete template content for editing.

**Path Params:**

- `id`: Template ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    template: Template  // Full template object with all content
  },
  requestId: string
}
```

---

### Get Template Images

**GET** `/templates/:id/images`

**Auth Required**: Yes

**Permission Check**: Edit access required

Get list of images and manifest for template.

**Path Params:**

- `id`: Template ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    images: string[],  // List of available image filenames
    manifest: {
      missingImages: {
        cover: boolean,
        storyElements: string[],  // Element IDs missing images
        playerIdentities: string[]  // Identity IDs missing images
      }
    }
  },
  requestId: string
}
```

---

### Export Templates

**POST** `/templates/export`

**Auth Required**: Yes

**Permission Required**: `templates_create` or `templates_see_all`

Export templates as a ZIP archive.

**Request Body:**

```typescript
{
  templateIds: string[],
  requestId?: string
}
```

**Response:**
Binary ZIP file with `Content-Type: application/zip`

**Error Cases:**

- `400`: No template IDs provided
- `403`: Insufficient permissions
- `500`: Export failed

---

### Create Template

**POST** `/templates`

**Auth Required**: Yes

**Permission Required**: `templates_create`; saving an existing template also takes edit access to it (the template's creator, or `templates_edit_all`)

Create a new template, or save the existing one `template.id` names:

- No `template.id`, or an empty one: the server gives the template a fresh UUID.
- A UUID no template has: the template is created under it.
- The id of an existing template (its folder or its database entry): it is saved as **PUT** `/templates/:id` saves it, with the same checks.

A new template's creator is the caller, whatever `creatorId` the body names. Setting `publicationStatus` to `"published"` needs `templates_publish`, and setting `showOnWelcomeScreen` or `order` to other than the template's stored values (for a new template, `false` and `999`) needs `templates_carousel`.

**Request Body:**

```typescript
{
  template: Template,  // Full template object
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    template: Template
  },
  requestId: string
}
```

**Status Code**: `201` for created or saved

**Error Cases:**

- `400`: Missing template data, or a `template.id` that isn't a UUID
- `401`: Not signed in
- `403`: No `templates_create`, no edit access to the existing template, or publishing or changing the welcome-screen settings without the permission for it
- `404`: The id names a template folder without its database entry
- `500`: Save failed

---

### Update Template

**PUT** `/templates/:id`

**Auth Required**: Yes

**Permission Check**: Edit access, publication status change permission, carousel permission

Update an existing template. Without `templates_edit_all`, the caller stays the template's creator whatever `creatorId` the body names.

**Path Params:**

- `id`: Template ID

**Request Body:**

```typescript
{
  template: Template,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    template: Template
  },
  requestId: string
}
```

---

### Delete Template

**DELETE** `/templates/:id`

**Auth Required**: Yes

**Permission Check**: Edit access required

Delete a template and all associated files.

**Path Params:**

- `id`: Template ID

**Request Body:**

```typescript
{
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    success: true
  },
  requestId: string
}
```

---

### Generate Template with AI

**POST** `/templates/generate`

**Auth Required**: Yes

**Permission Required**: `templates_create`

**Rate Limit**: Applied for non-admin users (templateGeneration)

**Content Moderation**: Applied to prompt

Generate a new template using AI.

**Request Body:**

```typescript
{
  prompt: string,
  playerCount: 1 | 2 | 3 | 4,
  maxTurns: number,
  gameMode: "adventure" | "mystery" | "educational",
  generateImages: boolean,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    template: Template,
    provenance: AiContentProvenance  // machine-readable "AI-generated" marker (core/types/provenance.ts)
  },
  requestId: string
}
```

**Status Code**: `201` for created

**Error Cases:**

- `400`: Missing required fields or moderation blocked
- `429`: Rate limit exceeded
- `500`: Generation failed, or the content filter was unavailable (it fails closed)

---

### Iterate Template with AI

**POST** `/templates/:id/iterate`

**Auth Required**: Yes

**Permission Check**: Edit access and `templates_create` required

**Rate Limit**: Applied for non-admin users (templateIteration)

**Content Moderation**: Applied to feedback

Use AI to iterate on specific sections of a template.

**Path Params:**

- `id`: Template ID

**Request Body:**

```typescript
{
  feedback: string,  // Instructions for AI
  sections: string[],  // Sections to iterate (e.g., ["storyElements", "playerIdentities"])
  gameMode: string,
  playerCount: 1 | 2 | 3 | 4,
  maxTurns: number,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    templateUpdate: Partial<Template>,  // Updated sections
    provenance: AiContentProvenance  // machine-readable "AI-generated" marker
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Missing required fields or moderation blocked
- `404`: Template not found
- `429`: Rate limit exceeded
- `500`: Generation failed, or the content filter was unavailable (it fails closed)

---

### Upload Template File

**POST** `/templates/:id/files`

**Auth Required**: Yes

**Permission Check**: Edit access required

Upload a file to template directory (typically images).

**Path Params:**

- `id`: Template ID

**Query Params:**

- `subdir` (optional): Subdirectory path (e.g., `"images"`)
- `requestId` (optional): Request tracking ID

**Form Data:**

- `file`: File to upload (multipart/form-data)

**Response:**

```typescript
{
  success: true,
  data: {
    success: true,
    path: string  // Relative path to uploaded file
  },
  requestId: string
}
```

**Error Cases:**

- `400`: No file provided or invalid subdirectory
- `404`: Template not found

---

### Import Template from ZIP

**POST** `/templates/import`

**Auth Required**: Yes

**Permission Required**: `templates_create`; importing over an existing template also takes edit access to it

Import a template from a ZIP archive: its `template.json`, at the root or in a folder named by the template's id (as Export lays it out), and the files beside it. The template's id is `template.json`'s `id`, or, for a zip that holds only files, the name of its folder; it must be a UUID. A template with that id is updated, otherwise a new one is created.

Before anything is written to the template's folder, the import checks edit access to an existing template, and applies the publication status and carousel checks of **PUT** `/templates/:id` to `template.json` (for a new template, against `false` and `999`). The zip is unpacked into a temporary folder, removed afterwards, and its files land only in the template's folder. The template keeps the creator its database entry names; a new one's creator is the importer. Its `template.json` names that creator.

**Query Params:**

- `requestId` (optional): Request tracking ID

**Form Data:**

- `zip`: ZIP file containing template(s) (multipart/form-data)

**Response:**

```typescript
{
  success: true,
  data: {
    template: Template,
    filesImported: number,
    files: string[],
    isNewTemplate: boolean
  },
  requestId: string
}
```

**Error Cases:**

- `400`: No file, not a ZIP archive, a template id that isn't a UUID, or a zip of only files for a template that doesn't exist
- `401`: Not signed in
- `403`: No `templates_create`, no edit access to the existing template, or publishing or changing the welcome-screen settings without the permission for it
- `404`: The id names a template folder without its database entry
- `500`: Import failed

---

## Image Endpoints

### Get Template Image

**GET** `/images/templates/:templateId/:path(*)`

Serve template images. Public access.

**Path Params:**

- `templateId`: Template ID
- `path`: Path to image file (e.g., `"cover.jpeg"` or `"subdirectory/image.png"`)

**Query Params:**

- `t` (optional): Timestamp for cache busting (short cache if present, long cache otherwise)
- `requestId` (optional): Request tracking ID

**Response:**
Binary image file with appropriate `Content-Type` and `Cache-Control` headers.

**Supported Extensions**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`

**Error Cases:**

- `400`: Invalid path parameters
- `404`: Image not found

---

### Get Story Image

**GET** `/images/stories/:storyId/:path(*)`

Serve story images.

**Path Params:**

- `storyId`: Story ID
- `path`: Path to image file

**Query Params:**

- `t` (optional): Timestamp for cache busting
- `requestId` (optional): Request tracking ID

**Response:**
Binary image file with appropriate headers.

**Error Cases:**

- `400`: Invalid path parameters
- `404`: Image not found

---

### Rename Template Image

**POST** `/images/templates/:id/rename`

**Auth Required**: Yes

**Permission Check**: Edit access required (the template's creator, or `templates_edit_all`)

Rename image when story element ID changes. The template editor calls it after a save that changed an element's id.

**Path Params:**

- `id`: Template ID

**Request Body:**

```typescript
{
  oldElementId: string,
  newElementId: string,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    success: true,
    message: string
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Missing or invalid element ids
- `401`: Not signed in
- `403`: No edit access to this template
- `404`: Template not found

---

### Delete Template Image

**DELETE** `/images/templates/:id/element/:elementId`

**Auth Required**: Yes

**Permission Check**: Edit access required (the template's creator, or `templates_edit_all`)

Delete the stored image (`images/<elementId>.jpeg`) for a story element. No client code calls it yet.

**Path Params:**

- `id`: Template ID
- `elementId`: Story element ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    success: true,
    message: string
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Invalid element id
- `401`: Not signed in
- `403`: No edit access to this template
- `404`: Template not found

---

### Test Image Server

**GET** `/images/test`

Test endpoint to verify image server is working.

**Response:**

```
"Image server is working correctly!"
```

---

## Video Endpoints (no generator)

Sora was retired on 2026-09-24 and no video generator is implemented. The serving routes, storage helpers, types (`core/types/video.ts`) and the `templates_videos` permission are provider-neutral; a new generator belongs in `server/src/videos/AIVideoGenerator.ts`.

### Get Template Video

**GET** `/videos/templates/:templateId/:path(*)`

Serve template videos (`.mp4`, `.webm`, `.mov`) from `templates/:templateId/videos/`. Similar structure to image endpoints.

**Path Params:**

- `templateId`: Template ID
- `path`: Path to video file

**Query Params:**

- `t` (optional): Timestamp for cache busting
- `requestId` (optional): Request tracking ID

**Response:**
Binary video file with appropriate headers.

**Error Cases:**

- `400`: Invalid path parameters or file type
- `404`: Video not found

---

### Get Story Video

**GET** `/videos/stories/:storyId/:path(*)`

Serve story videos from `stories/:storyId/videos/`. Same params, response and error cases as the template route.

---

### Generate Video

**POST** `/videos/generate`

**Auth Required**: Yes, plus the `templates_videos` permission

Always responds `501` with `errorMessage` "Video generation is not available: no video generator is currently implemented." The handler reads nothing from the body except `requestId`.

---

## Feedback Endpoints

### Submit Feedback

**POST** `/feedback/submit`

**Auth Required**: No (optional, associates feedback with user if authenticated)

Submit user feedback.

**Request Body:**

```typescript
{
  type: "beat" | "general" | "issue" | "suggestion",
  rating: "positive" | "negative" | null,
  comment: string,
  storyId?: string,
  storyTitle?: string,
  contactInfo?: string,
  storyText?: string,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    feedbackId: string
  },
  requestId: string
}
```

---

## Newsletter Endpoints

### Subscribe to Newsletter

**POST** `/newsletter/subscribe`

Subscribe email to newsletter.

**Request Body:**

```typescript
{
  email: string,
  requestId?: string
}
```

**Response:**

```typescript
{
  success: true,
  data: {
    message: string
  },
  requestId: string
}
```

---

## Admin System Endpoints

The admin "System" page's three read-only routes (`server/src/system/adminSystemRoutes.ts`; `/admin/system` in the client), listed here as the exception to this document's non-admin scope. Both need an admin (`verifyAdmin`).

### Get Connection Report

**GET** `/admin/system/connection`

How the server sees the caller's own request, for setting `TRUST_PROXY` (`.context/deployment.md`, "Client address (`TRUST_PROXY`)"). Sent with `Cache-Control: private, no-store`; it reads, stores and logs nothing of the request. CORS allows an `X-Forwarded-For` header, which the page's second request forges.

**Response:** `ConnectionReport` (`core/types/api.ts`): `address` (what the per-address limits count by, or null), `trustProxy` (the configured count, or null when unset), `connectionAddress` (the socket), `forwardedFor` (the chain as sent, left to right), `candidates` (for each count from 0 to the chain's length, the address it would give), `host`, `protocol`.

### Get Unreadable Address Counts

**GET** `/admin/system/addresses`

How many of the server's address reads found no client address, for spotting a `TRUST_PROXY` set higher than the proxy chain (`.context/deployment.md`). Sent with `Cache-Control: private, no-store`; counts only.

**Response:** `UnreadableAddressCounts` (`core/types/api.ts`): `sinceStart` (`unreadable`, `total`, `since` in ms) and `lastHour` (`unreadable`, `total`).

### Get Spend Totals

**GET** `/admin/system/spend`

Today's and this month's AI spend per bucket (`anonymous`, `account`, `other`; UTC days), with each bucket's daily ceiling.

**Response:** `SpendTotals` (`core/types/api.ts`): `today`, `monthStart`, and per bucket `today` and `month` (`usd`, `textCalls`, `imageCalls`) and `ceilingUsdPerDay` (null when none is set; always null for `other`).

**Error Cases:**

- `500`: Failed to load the spend totals

---

## WebSocket API

### Connection

**Endpoint**: `ws://localhost:3000` (development) or `wss://api.chosenpath.ai` (production)

**Transport**: Socket.IO

**Authentication**: Passed via query parameter `?code=STORY_CODE`

### Events (Client → Server)

#### `join`

Join a game session with player code.

```typescript
{
  code: string; // Player access code
}
```

**Response Event**: `joined` or `error`

---

#### `action`

Submit a player action.

```typescript
{
  action: string,  // Player's action text
  requestId: string
}
```

**Response Event**: `actionResult` or `actionError`

---

#### `disconnect`

Client disconnection (automatic).

---

### Events (Server → Client)

#### `joined`

Successful join confirmation.

```typescript
{
  storyId: string,
  playerSlot: number,
  playerName: string
}
```

---

#### `storyState`

Full story state update.

```typescript
{
  story: Story,  // Complete story object
  currentBeat: Beat,
  availableActions: string[],
  isPlayerTurn: boolean,
  requestId?: string
}
```

---

#### `actionResult`

Result of submitted action.

```typescript
{
  success: true,
  beat: Beat,
  outcomeIndex: number,
  isGameOver: boolean,
  requestId: string
}
```

---

#### `actionError`

Error processing action.

```typescript
{
  error: string,
  requestId: string
}
```

---

#### `imageGenerated`

Image generation complete.

```typescript
{
  imageUrl: string,
  requestId: string
}
```

---

#### `playerJoined`

Another player joined the session.

```typescript
{
  playerSlot: number,
  playerName: string
}
```

---

#### `playerLeft`

Another player left the session.

```typescript
{
  playerSlot: number,
  playerName: string
}
```

---

#### `error`

General error message.

```typescript
{
  error: string,
  requestId?: string
}
```

---

## Client Routes

The following client routes are available for navigation:

### Public Routes

- `/` - Welcome page
- `/setup` - Story initialization
- `/credits` - Credits page
- `/privacy` - Privacy policy
- `/for-storytellers` - Information for storytellers
- `/for-coaches` - Information for coaches
- `/for-educators` - Information for educators
- `/for-therapists` - Information for therapists
- `/stewardship` - For organisations that could take the project on
- `/academy` - Academy landing page
- `/academy/:lectureId` - Individual lecture pages
- `/library` - Template library browser
- `/templates/:id/configure` - Template configurator
- `/game/:code` - Join/play a game session

### Route Loaders

#### `/templates/:id/configure`

Loads template data via `configurableTemplateLoader`.

**Error**: Throws 400 if template ID is missing. The route's `TemplateErrorBoundary` shows what any loader or render error means in plain words, through `describeTemplateError` (`client/src/resources/templates/loaders/templateLoadErrors.ts`), never the raw error text: a missing (404) or unshared (401/403) template "isn't available — it may have been removed, or its creator isn't sharing it right now" (a "private" template is only unlisted, so its links still work), without Retry; a failed connection says so and offers Retry; a template missing its player counts (`InvalidTemplateError`) can't be played, without Retry; anything else gets a plain message and Retry.

---

#### `/library`

Loads library data via `libraryLoader`.

**Error**: When the templates can't be fetched (and `templateCache` holds no copy, stale or fresh), the loader returns no templates and `loadFailed: true` instead of throwing. `LibraryBrowser` then shows "We couldn't load the library" with Retry (`LibraryLoadFailedNotice`; Retry revalidates the route) in place of the filters, so the no-matches card only ever means the filters match nothing. A retry that works mounts the library afresh, with the URL's filters.

---

## Security Considerations

### Path Traversal Protection

All file serving endpoints (`/images`, `/videos`), the template image rename and delete endpoints, and `/image-generation/template/*` (its `templateId`, element id, player slot and reference image ids; `validateSafePaths` in `server/src/shared/safePaths.ts`) validate path parameters to prevent directory traversal attacks:

- No `..` sequences allowed
- No backslashes allowed
- No absolute paths (starting with `/`)

A template id that `POST /templates` or `POST /templates/import` takes from the request must be a UUID (`isUuid` in the same file).

### Content Moderation

These endpoints screen user-written text before generation:

- `POST /stories`: the premise.
- `/templates/generate` and `/templates/:id/iterate`: the prompt or feedback. The filter looks for the prohibited-content rules, inappropriate content, copyright infringement and other policy violations.
- `/image-generation/template/*`: the description and image instructions. The filter checks the prohibited-content rules only.

The filter fails closed. If it cannot answer, the request is refused: a `500` with the route's generic failure message, or the `TECHNICAL` image error. Details are in `.context/content-safety.md`.

### Rate Limiting

Rate limits are applied to (windows in `RATE_LIMITS`, `core/config.ts`; who counts for what in `.context/security.md`):

- **Login**: `login` per address, failed logins only
- **Registration**: `register` limit per address, created accounts only
- **Story Creation**: `initialize_story` per address when signed out; `initialize_story_text` or `initialize_story_images` per account when signed in. A signed-in account reads its own `initialize_story_text` count with `GET /stories/starts-left`, which counts nothing
- **Choices** (socket `make_choice`, `select_character`, `retry_turn`): `make_choice` limit per seat in stories an account started, otherwise per address
- **Code checks** (socket `verify_code` and `rejoin_session`, `GET /stories/:code/exists`): `verify_code` limit per address, misses only
- **Template Generation**: `templateGeneration` limit (non-admin)
- **Template Iteration**: `templateIteration` limit (non-admin)

Story creation is also refused with a `503` once today's spend ceiling for its kind of story is reached (`.context/deployment.md`, "Daily spend ceilings").

### Permission-Based Access

Template modification endpoints verify:

- **Edit Access**: User owns template or has `templates_see_all` permission
- **Create Permission**: User has `templates_create` permission
- **Publication Status**: Changing requires specific permissions
- **Carousel**: Setting `showOnWelcomeScreen` requires specific permissions

---

## Common Error Codes

- `400` - Bad Request (invalid parameters, validation failed)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error (unexpected server error)
- `503` - Service Unavailable (story starts only: today's spend ceiling is reached)

---

## Best Practices

1. **Always include `requestId`** in requests for debugging and tracking
2. **Handle rate limits gracefully** by showing retry time to users
3. **Validate inputs client-side** before sending to reduce error responses
4. **Use WebSocket for real-time game interactions** rather than polling HTTP endpoints
5. **Cache images appropriately** using the `t` parameter for cache busting when needed
6. **Handle authentication state** by checking `/auth/me` on app initialization
7. **Use SSE streams** for long-running operations (story creation) to provide progress updates

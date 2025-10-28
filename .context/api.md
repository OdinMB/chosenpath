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
- `500`: Registration failed

---

### Login

**POST** `/auth/login`

Authenticate user and receive auth cookie.

**Rate Limit**: Applied per IP/user

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

**Rate Limit**: Applied (initialize_story)

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

Story is generated asynchronously. Client should poll `/stories/:id/status` to check when ready.

**Error Cases:**

- `429`: Rate limit exceeded
- `500`: Story creation failed

---

### Create Story from Template

**POST** `/stories/template`

**Auth Required**: No (optional)

**Rate Limit**: Applied (initialize_story)

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

---

### Check Story Status

**GET** `/stories/:id/status`

Check the initialization status of a story.

**Path Params:**

- `id`: Story ID

**Query Params:**

- `requestId` (optional): Request tracking ID

**Response:**

```typescript
{
  success: true,
  data: {
    status: "initializing" | "ready" | "error"
  },
  requestId: string
}
```

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

Get template metadata by ID. Public for published/private templates, requires auth for draft/review.

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

- `401`: Authentication required (for draft/review templates)
- `403`: Insufficient permissions
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

**Permission Required**: `templates_create`

Create a new template.

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

**Status Code**: `201` for created

---

### Update Template

**PUT** `/templates/:id`

**Auth Required**: Yes

**Permission Check**: Edit access, publication status change permission, carousel permission

Update an existing template.

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
    template: Template
  },
  requestId: string
}
```

**Status Code**: `201` for created

**Error Cases:**

- `400`: Missing required fields or moderation blocked
- `429`: Rate limit exceeded

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
    templateUpdate: Partial<Template>  // Updated sections
  },
  requestId: string
}
```

**Error Cases:**

- `400`: Missing required fields or moderation blocked
- `404`: Template not found
- `429`: Rate limit exceeded

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

**Permission Required**: `templates_create`

Import template(s) from a ZIP archive.

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

- `400`: No file or not a ZIP archive
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

**POST** `/images/templates/:templateId/rename`

**Auth Required**: Yes (implied by template modification)

Rename image when story element ID changes.

**Path Params:**

- `templateId`: Template ID

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

---

### Delete Template Image

**DELETE** `/images/templates/:templateId/element/:elementId`

**Auth Required**: Yes (implied by template modification)

Delete image for a story element.

**Path Params:**

- `templateId`: Template ID
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

---

### Test Image Server

**GET** `/images/test`

Test endpoint to verify image server is working.

**Response:**

```
"Image server is working correctly!"
```

---

## Video Endpoints (in development)

### Get Template Video

**GET** `/videos/templates/:templateId/:path(*)`

Serve template videos. Similar structure to image endpoints.

**Path Params:**

- `templateId`: Template ID
- `path`: Path to video file

**Query Params:**

- `t` (optional): Timestamp for cache busting
- `requestId` (optional): Request tracking ID

**Response:**
Binary video file with appropriate headers.

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
- `/academy` - Academy landing page
- `/academy/:lectureId` - Individual lecture pages
- `/library` - Template library browser
- `/templates/:id/configure` - Template configurator
- `/game/:code` - Join/play a game session

### Route Loaders

#### `/templates/:id/configure`

Loads template data via `configurableTemplateLoader`.

**Error**: Throws 400 if template ID is missing.

---

#### `/library`

Loads library data via `libraryLoader`.

---

## Security Considerations

### Path Traversal Protection

All file serving endpoints (`/images`, `/videos`) validate path parameters to prevent directory traversal attacks:

- No `..` sequences allowed
- No backslashes allowed
- No absolute paths (starting with `/`)

### Content Moderation

AI generation endpoints (`/templates/generate`, `/templates/iterate`) apply content filtering to detect:

- Inappropriate content
- Copyright infringement
- Other policy violations

### Rate Limiting

Rate limits are applied to:

- **Login**: Per IP/user
- **Story Creation**: `initialize_story` limit
- **Template Generation**: `templateGeneration` limit (non-admin)
- **Template Iteration**: `templateIteration` limit (non-admin)

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

---

## Best Practices

1. **Always include `requestId`** in requests for debugging and tracking
2. **Handle rate limits gracefully** by showing retry time to users
3. **Validate inputs client-side** before sending to reduce error responses
4. **Use WebSocket for real-time game interactions** rather than polling HTTP endpoints
5. **Cache images appropriately** using the `t` parameter for cache busting when needed
6. **Handle authentication state** by checking `/auth/me` on app initialization
7. **Use SSE streams** for long-running operations (story creation) to provide progress updates

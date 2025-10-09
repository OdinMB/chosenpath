# Template Story Element and Stat ID Automation

This document describes the automated ID generation and image file management system implemented to simplify template editing by hiding ID management from users while ensuring proper image file handling.

## Overview

The system automatically generates IDs for story elements and stats based on their names, removing the burden of manual ID management from users. However, this creates complexity around image file handling since image files on disk are named using IDs. The solution involves a deferred image operation system that tracks pending renames and provides UI compatibility during the editing process.

## Core Components

### 1. UUID System for Element Identity

Each story element has a permanent UUID that never changes, providing stable identity tracking:

```typescript
interface StoryElement {
  uuid?: string; // Fixed forever - for tracking across saves/reverts
  id: string; // Auto-generated from name - for file naming
  name: string;
  // ... other fields
}
```

**Key Properties:**

- **Permanent**: UUIDs never change once assigned
- **Unique**: Generated using `crypto.randomUUID()`
- **Invisible**: Hidden from users in production UI
- **Reliable**: Enables accurate matching across template versions

### 2. ID Generation (`client/src/shared/utils/idGeneration.ts`)

The `generateIdFromName()` function creates URL-safe IDs from human-readable names:

### 2. Automatic ID Updates

IDs are automatically updated when names change in:

**Story Elements** (`useTemplateForm.ts:handleStoryElementsChange`):

- Generates new IDs when element names change
- Tracks ID changes for image file operations
- Updates `sourceImageIds` references to use new IDs
- Updates cover image references

**Stats** (`useTemplateForm.ts:handleStatsAndPlayersUpdate`):

- Processes both shared and player stats
- Maintains uniqueness across all stat types
- Preserves stat references in backgrounds and other configurations

### 3. Deferred Image Operations System

Since image files are stored on disk using the old IDs, the system implements a deferred operation pattern:

**Pending Operations** (`useTemplateForm.ts`):

```typescript
interface PendingImageOperation {
  type: "rename";
  oldId: string;
  newId: string;
}
```

**Key Functions:**

- `setPendingImageOperations()`: Queues rename operations when IDs change
- `getEffectiveImageId()`: Maps current IDs back to original file IDs for display
- Executes operations only after successful template save

### 4. UI Compatibility During Editing

To ensure images display correctly while edits are pending:

**Effective ID Mapping**:

- UI components receive `getEffectiveImageId` function
- Maps new IDs back to original file names for image loading
- Walks backwards through pending operations to find original ID
- Handles chained renames (A→B→C traces back to A)

**Component Integration**:

- `ReferenceImageSelector`: Uses effective IDs for image display
- `StoryElementEditor`: Shows images using effective IDs
- Both components receive `pendingImageOperations` for context

## Execution Flow

### During Editing

1. User changes element/stat name
2. System generates new ID using `generateIdFromName()`
3. If ID changes, adds pending rename operation
4. Updates all internal references to use new ID
5. UI displays images using `getEffectiveImageId()` (old file names)

### During Save

1. Template saved with new IDs
2. System executes pending image operations via API
3. `templateApi.renameTemplateImage()` renames files on disk
4. Pending operations cleared on success
5. Template images cache invalidated and refetched

### During Revert to Previous Save

1. System matches elements by UUID only
2. Detects elements with same UUID but different IDs
3. Queues rename operations to restore original IDs from reverted template
4. UI displays images using effective IDs (current file names) until save
5. Operations execute when template is next saved
6. Templates without UUIDs get them assigned during template loading (migration)

### Error Handling

- Failed rename operations show user notifications
- Template save succeeds even if image renames fail
- Orphaned images remain in template library
- System continues to function with mixed ID states

## Technical Implementation Details

### ID Generation Constraints

- **Uniqueness**: Maintained within each ID scope (elements, shared stats, player stats)
- **Stability**: Same name always generates same base ID
- **Safety**: No special characters that could break file systems or URLs

### Image File Management

- **Naming**: Image files use ID as filename (e.g., `professor_azura.jpeg`)
- **Atomicity**: Template saves are independent of image renames
- **Consistency**: System maintains UI consistency during transition periods

### Reference Updates

The system updates all ID references when changes occur:

- **Story Elements**: `sourceImageIds` arrays
- **Template**: `coverImageReferenceIds` array
- **Stats**: Background stat references, player options

### Development vs Production Behavior

- **Development**: ID fields visible but disabled with explanatory tooltips
- **Production**: ID fields completely hidden from UI
- **Debugging**: `import.meta.env.DEV` controls visibility

## Testing Strategy

Comprehensive test coverage includes:

- **Unit Tests**: ID generation logic and uniqueness (`idGeneration.test.ts`)
- **Deferred Operations**: Pending operation logic (`deferredImageOperations.test.ts`)
- **Image References**: Reference updating logic (`imageReferenceUpdate.test.ts`)
- **Validation**: Image reference validation (`imageReferenceValidation.test.ts`)
- **Revert Operations**: Revert-to-save image operation detection (`revertImageOperations.test.ts`)

## Benefits

1. **User Experience**: No manual ID management required
2. **Consistency**: Automated generation prevents typos and inconsistencies
3. **Backward Compatibility**: Existing templates continue to work
4. **Image Preservation**: No data loss during ID transitions
5. **Error Recovery**: System handles partial failures gracefully

## Potential Issues and Mitigations

**Race Conditions**:

- Mitigated by executing image operations after template save
- Pending operations provide transition state management

**Name Collisions**:

- Automatic uniqueness handling with numbered suffixes
- Deterministic generation reduces unexpected changes

**File System Errors**:

- User notifications for failed operations
- Template functionality preserved even with image rename failures
- Orphaned images remain accessible in template library

## Future Considerations

- **Bulk Operations**: Batch image renames for performance
- **Undo/Redo**: Track operation history for reverting changes
- **Migration Tools**: Utilities for migrating existing templates
- **Performance**: Optimize for templates with many elements
- **Conflict Resolution**: Advanced handling of simultaneous edits

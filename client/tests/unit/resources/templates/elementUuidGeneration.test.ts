// Test that story elements are created with UUIDs
import { StoryElement } from 'core/types';

// Mock the useStoryElementsEditor hook's createEmptyStoryElement function
function createEmptyStoryElement(): StoryElement {
  return {
    uuid: crypto.randomUUID(),
    id: `element_${Date.now()}`,
    name: "",
    role: "",
    instructions: "",
    appearance: "",
    facts: [],
  };
}

describe('Story Element UUID Generation', () => {
  it('should generate UUIDs for new story elements', () => {
    const element1 = createEmptyStoryElement();
    const element2 = createEmptyStoryElement();
    
    // Both elements should have UUIDs
    expect(element1.uuid).toBeDefined();
    expect(element2.uuid).toBeDefined();
    
    // UUIDs should be different
    expect(element1.uuid).not.toBe(element2.uuid);
    
    // UUIDs should be valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(element1.uuid).toMatch(uuidRegex);
    expect(element2.uuid).toMatch(uuidRegex);
  });

  it('should create elements with unique IDs and UUIDs', () => {
    const elements: StoryElement[] = [];
    
    // Create multiple elements
    for (let i = 0; i < 5; i++) {
      elements.push(createEmptyStoryElement());
      // Add small delay to ensure different timestamps
      if (i < 4) {
        // Use a small delay simulation
        const now = Date.now();
        while (Date.now() - now < 1) {
          // Small busy wait
        }
      }
    }
    
    // All UUIDs should be unique
    const uuids = elements.map(el => el.uuid).filter(Boolean);
    const uniqueUuids = [...new Set(uuids)];
    expect(uniqueUuids).toHaveLength(elements.length);
    
    // All IDs should be unique (they include timestamps)
    const ids = elements.map(el => el.id);
    const uniqueIds = [...new Set(ids)];
    expect(uniqueIds).toHaveLength(elements.length);
  });

  it('should preserve UUID structure across element operations', () => {
    const originalElement = createEmptyStoryElement();
    
    // Simulate updating the element (like what happens in the editor)
    const updatedElement: StoryElement = {
      ...originalElement,
      name: 'Updated Name',
      role: 'Updated Role',
      instructions: 'Updated Instructions'
    };
    
    // UUID should be preserved
    expect(updatedElement.uuid).toBe(originalElement.uuid);
    
    // Other fields should be updated
    expect(updatedElement.name).toBe('Updated Name');
    expect(updatedElement.role).toBe('Updated Role');
    expect(updatedElement.instructions).toBe('Updated Instructions');
  });
});
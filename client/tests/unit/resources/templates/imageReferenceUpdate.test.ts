import { StoryTemplate, StoryElement } from 'core/types';
import { generateIdFromName } from '../../../../src/shared/utils/idGeneration';

describe('Image Reference Updates', () => {
  it('should update cover image references when element IDs change', () => {
    // Mock template with cover image references
    const template: Partial<StoryTemplate> = {
      id: 'test-template',
      coverImageReferenceIds: ['professor_azura', 'magic_tower'],
      storyElements: [
        {
          id: 'professor_azura',
          name: 'Professor Azura',
          role: 'Mentor',
          instructions: 'Guide the player',
          appearance: 'Wise wizard',
          facts: []
        },
        {
          id: 'magic_tower',
          name: 'Magic Tower',
          role: 'Location',
          instructions: 'Central hub',
          appearance: 'Tall spire',
          facts: []
        }
      ]
    };

    // Simulate element name change: "Professor Azura" -> "Professor Azuraa"
    const updatedElements: StoryElement[] = template.storyElements!.map(element => {
      if (element.id === 'professor_azura') {
        return { ...element, name: 'Professor Azuraa' };
      }
      return element;
    });

    // Simulate ID changes detection
    const idChanges: Array<{ oldId: string; newId: string }> = [];
    const existingIds = updatedElements.filter(e => e.id).map(e => e.id!);
    
    updatedElements.forEach((element) => {
      if (!element.name?.trim()) return;
      
      const otherIds = existingIds.filter(id => id !== element.id);
      const newId = generateIdFromName(element.name, otherIds);
      
      if (element.id && element.id !== newId) {
        idChanges.push({ oldId: element.id, newId });
      }
    });

    // Verify ID change detected
    expect(idChanges).toHaveLength(1);
    expect(idChanges[0]).toEqual({
      oldId: 'professor_azura',
      newId: 'professor_azuraa'
    });

    // Simulate reference updates
    const updatedCoverRefs = template.coverImageReferenceIds?.map(refId => {
      const change = idChanges.find(c => c.oldId === refId);
      return change ? change.newId : refId;
    });

    // Verify cover references updated
    expect(updatedCoverRefs).toEqual(['professor_azuraa', 'magic_tower']);
  });

  it('should update story element source image references when element IDs change', () => {
    // Mock template with elements that reference each other's images
    const template: Partial<StoryTemplate> = {
      id: 'test-template',
      storyElements: [
        {
          id: 'professor_azura',
          name: 'Professor Azura',
          role: 'Mentor',
          instructions: 'Guide the player',
          appearance: 'Wise wizard',
          facts: [],
          sourceImageIds: ['magic_tower', 'ancient_book'] // References other elements
        },
        {
          id: 'magic_tower',
          name: 'Magic Tower',
          role: 'Location',
          instructions: 'Central hub',
          appearance: 'Tall spire',
          facts: [],
          sourceImageIds: ['professor_azura'] // References professor
        },
        {
          id: 'ancient_book',
          name: 'Ancient Book',
          role: 'Item',
          instructions: 'Contains secrets',
          appearance: 'Glowing tome',
          facts: []
        }
      ]
    };

    // Simulate name change: "Professor Azura" -> "Professor Azuraa"
    const updatedElements: StoryElement[] = template.storyElements!.map(element => {
      if (element.id === 'professor_azura') {
        return { ...element, name: 'Professor Azuraa' };
      }
      return element;
    });

    // Detect ID changes
    const idChanges: Array<{ oldId: string; newId: string }> = [];
    const existingIds = updatedElements.filter(e => e.id).map(e => e.id!);
    
    updatedElements.forEach((element) => {
      if (!element.name?.trim()) return;
      
      const otherIds = existingIds.filter(id => id !== element.id);
      const newId = generateIdFromName(element.name, otherIds);
      
      if (element.id && element.id !== newId) {
        idChanges.push({ oldId: element.id, newId });
      }
    });

    // Update source image references
    const updatedElementsWithRefs = updatedElements.map(element => {
      if (element.sourceImageIds && element.sourceImageIds.length > 0) {
        const updatedSourceIds = element.sourceImageIds.map(sourceId => {
          const change = idChanges.find(c => c.oldId === sourceId);
          return change ? change.newId : sourceId;
        });
        return { ...element, sourceImageIds: updatedSourceIds };
      }
      return element;
    });

    // Verify references updated correctly
    const professorElement = updatedElementsWithRefs.find(e => e.name === 'Professor Azuraa');
    expect(professorElement?.sourceImageIds).toEqual(['magic_tower', 'ancient_book']); // Unchanged

    const towerElement = updatedElementsWithRefs.find(e => e.id === 'magic_tower');
    expect(towerElement?.sourceImageIds).toEqual(['professor_azuraa']); // Updated reference
  });

  it('should handle multiple ID changes in a single update', () => {
    const template: Partial<StoryTemplate> = {
      coverImageReferenceIds: ['element_a', 'element_b'],
      storyElements: [
        {
          id: 'element_a',
          name: 'Element A',
          role: 'Test',
          instructions: 'Test',
          appearance: 'Test',
          facts: [],
          sourceImageIds: ['element_b']
        },
        {
          id: 'element_b', 
          name: 'Element B',
          role: 'Test',
          instructions: 'Test', 
          appearance: 'Test',
          facts: [],
          sourceImageIds: ['element_a']
        }
      ]
    };

    // Change both names
    const updatedElements: StoryElement[] = template.storyElements!.map(element => {
      if (element.id === 'element_a') {
        return { ...element, name: 'Element A Updated' };
      }
      if (element.id === 'element_b') {
        return { ...element, name: 'Element B Updated' };
      }
      return element;
    });

    // Detect multiple ID changes
    const idChanges: Array<{ oldId: string; newId: string }> = [];
    const existingIds = updatedElements.filter(e => e.id).map(e => e.id!);
    
    updatedElements.forEach((element) => {
      if (!element.name?.trim()) return;
      
      const otherIds = existingIds.filter(id => id !== element.id);
      const newId = generateIdFromName(element.name, otherIds);
      
      if (element.id && element.id !== newId) {
        idChanges.push({ oldId: element.id, newId });
      }
    });

    expect(idChanges).toHaveLength(2);
    expect(idChanges).toContainEqual({ oldId: 'element_a', newId: 'element_a_updated' });
    expect(idChanges).toContainEqual({ oldId: 'element_b', newId: 'element_b_updated' });

    // Update all references
    const updatedCoverRefs = template.coverImageReferenceIds?.map(refId => {
      const change = idChanges.find(c => c.oldId === refId);
      return change ? change.newId : refId;
    });

    expect(updatedCoverRefs).toEqual(['element_a_updated', 'element_b_updated']);
  });
});
// Test the UUID-based revert logic
import { StoryElement } from 'core/types';

describe('UUID-based Revert Operations Logic', () => {
  interface PendingImageOperation {
    type: 'rename';
    oldId: string;
    newId: string;
  }


  // Simulate the UUID-based revert image operation detection logic
  const detectUuidBasedImageOperationsForRevert = (
    currentElements: StoryElement[],
    revertedElements: StoryElement[]
  ): PendingImageOperation[] => {
    const imageOperationsForRevert: PendingImageOperation[] = [];
    
    // Match elements by UUID (primary) or fallback to name-based matching for backwards compatibility
    const currentElementsByUuid = new Map<string, StoryElement>();
    const revertedElementsByUuid = new Map<string, StoryElement>();
    
    // Build UUID maps for elements that have UUIDs
    currentElements.forEach(el => {
      if (el.uuid) {
        currentElementsByUuid.set(el.uuid, el);
      }
    });
    
    revertedElements.forEach(el => {
      if (el.uuid) {
        revertedElementsByUuid.set(el.uuid, el);
      }
    });
    
    // Find elements by UUID that need image operations
    currentElementsByUuid.forEach((currentElement, uuid) => {
      const revertedElement = revertedElementsByUuid.get(uuid);
      if (revertedElement && currentElement.id !== revertedElement.id) {
        // Same element (by UUID) but different IDs - need to rename image file
        imageOperationsForRevert.push({
          type: 'rename',
          oldId: currentElement.id,
          newId: revertedElement.id
        });
      }
    });
    
    return imageOperationsForRevert;
  };

  it('should detect no operations when elements have same UUIDs and IDs', () => {
    const uuid1 = 'uuid-professor';
    const uuid2 = 'uuid-tower';
    
    const currentElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid2, id: 'magic_tower', name: 'Magic Tower', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const revertedElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid2, id: 'magic_tower', name: 'Magic Tower', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(0);
  });

  it('should detect rename operation when same UUID has different ID', () => {
    const uuid1 = 'uuid-professor';
    const uuid2 = 'uuid-tower';
    
    const currentElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azuraa', name: 'Professor Azuraaa', role: '', instructions: '', appearance: '', facts: [] }, // Name and ID changed
      { uuid: uuid2, id: 'magic_tower', name: 'Magic Tower', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const revertedElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] }, // Original name and ID
      { uuid: uuid2, id: 'magic_tower', name: 'Magic Tower', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      type: 'rename',
      oldId: 'professor_azuraa',
      newId: 'professor_azura'
    });
  });

  it('should detect multiple rename operations for different UUIDs', () => {
    const uuid1 = 'uuid-professor';
    const uuid2 = 'uuid-tower';
    const uuid3 = 'uuid-artifact';
    
    const currentElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura_the_wise', name: 'Professor Azura the Wise', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid2, id: 'ancient_magic_tower', name: 'Ancient Magic Tower', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid3, id: 'unchanged_element', name: 'Unchanged Element', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const revertedElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid2, id: 'magic_tower', name: 'Magic Tower', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid3, id: 'unchanged_element', name: 'Unchanged Element', role: '', instructions: '', appearance: '', facts: [] }
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(2);
    
    const professorOp = operations.find(op => op.newId === 'professor_azura');
    const towerOp = operations.find(op => op.newId === 'magic_tower');
    
    expect(professorOp).toEqual({
      type: 'rename',
      oldId: 'professor_azura_the_wise',
      newId: 'professor_azura'
    });
    
    expect(towerOp).toEqual({
      type: 'rename',
      oldId: 'ancient_magic_tower',
      newId: 'magic_tower'
    });
  });

  it('should ignore elements without UUIDs (backward compatibility)', () => {
    const uuid1 = 'uuid-professor';
    
    const currentElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { id: 'no_uuid_element', name: 'No UUID Element', role: '', instructions: '', appearance: '', facts: [] } // No UUID
    ];

    const revertedElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { id: 'different_no_uuid', name: 'Different No UUID', role: '', instructions: '', appearance: '', facts: [] } // No UUID, different ID
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(0); // No operations since elements without UUIDs are ignored
  });

  it('should handle elements that exist in current but not in reverted (by UUID)', () => {
    const uuid1 = 'uuid-professor';
    const uuid2 = 'uuid-new-element';
    
    const currentElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] },
      { uuid: uuid2, id: 'new_element', name: 'New Element', role: '', instructions: '', appearance: '', facts: [] } // Only in current
    ];

    const revertedElements: StoryElement[] = [
      { uuid: uuid1, id: 'professor_azura', name: 'Professor Azura', role: '', instructions: '', appearance: '', facts: [] }
      // uuid2 element doesn't exist in reverted
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(0); // No rename needed for elements that don't exist in both versions
  });

  it('should handle complex name changes while preserving UUID relationships', () => {
    const uuid1 = 'uuid-professor';
    
    const currentElements: StoryElement[] = [
      { 
        uuid: uuid1, 
        id: 'dr_professor_azura_phd', 
        name: 'Dr. Professor Azura, PhD', 
        role: 'Advanced Academic', 
        instructions: 'Updated instructions', 
        appearance: 'Wearing graduation robes', 
        facts: ['Has multiple degrees', 'Leads the academy'] 
      }
    ];

    const revertedElements: StoryElement[] = [
      { 
        uuid: uuid1, 
        id: 'professor_azura', 
        name: 'Professor Azura', 
        role: 'Teacher', 
        instructions: 'Basic instructions', 
        appearance: 'Simple robes', 
        facts: ['Teaches magic'] 
      }
    ];

    const operations = detectUuidBasedImageOperationsForRevert(currentElements, revertedElements);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toEqual({
      type: 'rename',
      oldId: 'dr_professor_azura_phd',
      newId: 'professor_azura'
    });
  });
});
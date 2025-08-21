import { StoryTemplate } from 'core/types';
import { TemplateImageManifest } from 'core/types/api';
import { validateTemplateIntegrity, autoFixTemplate } from '../../../../src/resources/templates/utils/templateValidation';
import { checkImageReferenceConsistency } from '../../../../src/resources/templates/hooks/useTemplateWarnings';

describe('Image Reference Validation', () => {
  const mockTemplate: Partial<StoryTemplate> = {
    id: 'test-template',
    coverImageReferenceIds: ['professor_azura', 'magic_tower', 'missing_image'],
    storyElements: [
      {
        id: 'professor_azura',
        name: 'Professor Azura',
        role: 'Mentor',
        instructions: 'Guide the player',
        appearance: 'Wise wizard',
        facts: [],
        sourceImageIds: ['magic_tower', 'ancient_book', 'missing_element']
      },
      {
        id: 'magic_tower',
        name: 'Magic Tower',
        role: 'Location',
        instructions: 'Central hub',
        appearance: 'Tall spire',
        facts: [],
        sourceImageIds: ['professor_azura', 'nonexistent_image']
      }
    ],
    playerStats: [],
    sharedStats: [],
    statGroups: []
  };

  const mockImageManifest: TemplateImageManifest = {
    cover: true,
    storyElements: {
      'professor_azura': true,
      'magic_tower': true,
      'ancient_book': true // Image exists
    },
    playerIdentities: {
      'player1': {
        0: true,
        1: false
      }
    },
    totalImages: 4,
    missingImages: {
      cover: false,
      storyElements: [],
      playerIdentities: [{ playerSlot: 'player1', identityIndex: 1 }]
    }
  };

  describe('validateTemplateIntegrity', () => {
    it('should detect broken cover image references', () => {
      const result = validateTemplateIntegrity(mockTemplate as StoryTemplate, mockImageManifest);
      
      const coverRefIssue = result.issues.find(issue => 
        issue.category === 'images' && 
        issue.message.includes('Cover references missing images')
      );
      
      expect(coverRefIssue).toBeDefined();
      expect(coverRefIssue?.message).toBe('Cover references missing images: missing_image');
      expect(coverRefIssue?.affectedItems).toContain('missing_image');
      expect(coverRefIssue?.autoFixable).toBe(true);
    });

    it('should detect broken story element source image references', () => {
      const result = validateTemplateIntegrity(mockTemplate as StoryTemplate, mockImageManifest);
      
      const elementRefIssues = result.issues.filter(issue => 
        issue.category === 'images' && 
        issue.message.includes('Element') && 
        issue.message.includes('references missing images')
      );
      
      expect(elementRefIssues).toHaveLength(2);
      
      // Check Professor Azura element issue
      const professorIssue = elementRefIssues.find(issue => 
        issue.message.includes('Professor Azura')
      );
      expect(professorIssue).toBeDefined();
      expect(professorIssue?.message).toBe('Element "Professor Azura" references missing images: missing_element');
      expect(professorIssue?.affectedItems).toEqual(['professor_azura', 'missing_element']);

      // Check Magic Tower element issue  
      const towerIssue = elementRefIssues.find(issue => 
        issue.message.includes('Magic Tower')
      );
      expect(towerIssue).toBeDefined();
      expect(towerIssue?.message).toBe('Element "Magic Tower" references missing images: nonexistent_image');
      expect(towerIssue?.affectedItems).toEqual(['magic_tower', 'nonexistent_image']);
    });

    it('should not flag valid image references', () => {
      const validTemplate: Partial<StoryTemplate> = {
        id: 'valid-template',
        coverImageReferenceIds: ['professor_azura', 'magic_tower'], // Both exist
        storyElements: [
          {
            id: 'professor_azura',
            name: 'Professor Azura',
            role: 'Mentor',
            instructions: 'Guide the player',
            appearance: 'Wise wizard',
            facts: [],
            sourceImageIds: ['magic_tower'] // Exists
          }
        ],
        playerStats: [],
        sharedStats: [],
        statGroups: []
      };

      const result = validateTemplateIntegrity(validTemplate as StoryTemplate, mockImageManifest);
      
      const imageRefIssues = result.issues.filter(issue => 
        issue.category === 'images' && 
        issue.message.includes('references missing images')
      );
      
      expect(imageRefIssues).toHaveLength(0);
    });
  });

  describe('autoFixTemplate', () => {
    it('should remove broken cover image references', () => {
      const result = validateTemplateIntegrity(mockTemplate as StoryTemplate, mockImageManifest);
      const fixedTemplate = autoFixTemplate(mockTemplate as StoryTemplate, result.issues);
      
      expect(fixedTemplate.coverImageReferenceIds).toEqual(['professor_azura', 'magic_tower']);
      expect(fixedTemplate.coverImageReferenceIds).not.toContain('missing_image');
    });

    it('should remove broken story element source image references', () => {
      const result = validateTemplateIntegrity(mockTemplate as StoryTemplate, mockImageManifest);
      const fixedTemplate = autoFixTemplate(mockTemplate as StoryTemplate, result.issues);
      
      // Professor Azura should have missing_element removed but keep ancient_book (available)
      const professorElement = fixedTemplate.storyElements?.find(e => e.id === 'professor_azura');
      expect(professorElement?.sourceImageIds).toEqual(['magic_tower', 'ancient_book']);
      expect(professorElement?.sourceImageIds).not.toContain('missing_element');
      
      // Magic Tower should have nonexistent_image removed
      const towerElement = fixedTemplate.storyElements?.find(e => e.id === 'magic_tower');
      expect(towerElement?.sourceImageIds).toEqual(['professor_azura']);
      expect(towerElement?.sourceImageIds).not.toContain('nonexistent_image');
    });

    it('should preserve valid image references while removing broken ones', () => {
      const result = validateTemplateIntegrity(mockTemplate as StoryTemplate, mockImageManifest);
      const fixedTemplate = autoFixTemplate(mockTemplate as StoryTemplate, result.issues);
      
      // Verify valid references are preserved
      expect(fixedTemplate.coverImageReferenceIds).toContain('professor_azura');
      expect(fixedTemplate.coverImageReferenceIds).toContain('magic_tower');
      
      const professorElement = fixedTemplate.storyElements?.find(e => e.id === 'professor_azura');
      expect(professorElement?.sourceImageIds).toContain('magic_tower');
      expect(professorElement?.sourceImageIds).toContain('ancient_book');
      
      const towerElement = fixedTemplate.storyElements?.find(e => e.id === 'magic_tower');
      expect(towerElement?.sourceImageIds).toContain('professor_azura');
    });
  });

  describe('checkImageReferenceConsistency', () => {
    it('should detect broken references with available image IDs', () => {
      const availableImageIds = new Set(['professor_azura', 'magic_tower', 'ancient_book', 'cover']);
      
      const issues = checkImageReferenceConsistency(
        mockTemplate as StoryTemplate, 
        availableImageIds
      );
      
      expect(issues).toHaveLength(3);
      expect(issues).toContain('Cover references missing images: missing_image');
      expect(issues).toContain('Element "Professor Azura" references missing images: missing_element');
      expect(issues).toContain('Element "Magic Tower" references missing images: nonexistent_image');
    });

    it('should return no issues when all references are valid', () => {
      const availableImageIds = new Set([
        'professor_azura', 
        'magic_tower', 
        'ancient_book',
        'missing_image', 
        'missing_element', 
        'nonexistent_image'
      ]);
      
      const issues = checkImageReferenceConsistency(
        mockTemplate as StoryTemplate, 
        availableImageIds
      );
      
      expect(issues).toHaveLength(0);
    });
  });
});
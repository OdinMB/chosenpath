import {
  normalizeStoryText,
  calculateParagraphPositions,
  findImageParagraphIndex,
  findTextParagraphs,
  removePlaceholders,
  TextSegment
} from '../../../src/game/utils/storyTextProcessor.js';

// Mock the imageRepositioning import
jest.mock('../../../src/game/utils/imageRepositioning.js', () => ({
  optimizeImagePositions: jest.fn()
}));

describe('storyTextProcessor Helper Functions', () => {
  describe('normalizeStoryText', () => {
    test('should normalize text encoding', () => {
      const input = 'Test text';
      const result = normalizeStoryText(input);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    test('should remove trailing newlines after images', () => {
      const input = 'Some text [image id=test]\n\nMore text';
      const result = normalizeStoryText(input);
      expect(result).toBe('Some text [image id=test]\n\nMore text');
    });

    test('should convert single newlines to double newlines', () => {
      const input = 'Paragraph 1\nParagraph 2';
      const result = normalizeStoryText(input);
      expect(result).toBe('Paragraph 1\n\nParagraph 2');
    });

    test('should attach images at end of text to previous paragraph', () => {
      const input = 'Some text\n\n[image id=test]';
      const result = normalizeStoryText(input);
      expect(result).toBe('Some text [image id=test]');
    });

    test('should handle multiple consecutive newlines', () => {
      const input = 'Text\n\n\n\nMore text';
      const result = normalizeStoryText(input);
      expect(result).toBe('Text\n\nMore text');
    });

    test('should handle the sample story text correctly', () => {
      const sampleText = `...

From the sidelines, the city guards shift uneasily, their presence a constant reminder of the dangers you face. You meet the gaze of a stern-faced officer, and your heart quickens, but you hold your ground, your voice steady. "We will not be silenced," you assert, "not while injustice reigns."

The square buzzes with renewed energy, the crowd growing as more curious onlookers edge closer. You feel the weight of your outsider status, but also the spark of possibility. This moment, fragile and charged, could tip the balance in the struggle for goblin rights.

[image id=mizka_city_square_protest source=story desc="Mizka rallying protesters in City Square" float=right]`;

      const normalizedText = normalizeStoryText(sampleText);
      
      // The image should be attached to the previous paragraph, not create its own
      expect(normalizedText).toContain('goblin rights. [image id=mizka_city_square_protest');
      expect(normalizedText).not.toMatch(/\n\n\[image id=mizka_city_square_protest/);
    });
  });

  describe('calculateParagraphPositions', () => {
    test('should calculate positions for single paragraph', () => {
      const text = 'Single paragraph text';
      const result = calculateParagraphPositions(text);
      expect(result).toEqual([{ start: 0, end: 21 }]);
    });

    test('should calculate positions for multiple paragraphs', () => {
      const text = 'First paragraph\n\nSecond paragraph';
      const result = calculateParagraphPositions(text);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ start: 0, end: 15 });
      expect(result[1]).toEqual({ start: 17, end: 33 });
    });

    test('should handle empty paragraphs', () => {
      const text = 'Text\n\n\n\nMore text';
      const result = calculateParagraphPositions(text);
      expect(result).toHaveLength(3);
    });

    test('should handle text with image placeholders', () => {
      const text = 'Text paragraph\n\n[image id=test]\n\nAnother paragraph';
      const result = calculateParagraphPositions(text);
      expect(result).toHaveLength(3);
      expect(result[1].start).toBeLessThan(result[1].end);
    });
  });

  describe('findImageParagraphIndex', () => {
    const paragraphPositions = [
      { start: 0, end: 10 },
      { start: 12, end: 20 },
      { start: 22, end: 30 }
    ];

    test('should find correct paragraph for position within bounds', () => {
      expect(findImageParagraphIndex(5, paragraphPositions)).toBe(0);
      expect(findImageParagraphIndex(15, paragraphPositions)).toBe(1);
      expect(findImageParagraphIndex(25, paragraphPositions)).toBe(2);
    });

    test('should return last paragraph for position out of bounds', () => {
      expect(findImageParagraphIndex(100, paragraphPositions)).toBe(2);
    });

    test('should handle empty paragraph positions', () => {
      expect(findImageParagraphIndex(5, [])).toBe(0);
    });
  });

  describe('findTextParagraphs', () => {
    test('should identify text-only paragraphs', () => {
      const text = 'Text paragraph\n\n[image id=test]\n\nAnother text paragraph';
      const paragraphPositions = calculateParagraphPositions(text);
      const result = findTextParagraphs(text, paragraphPositions);
      
      expect(result).toHaveLength(3);
      expect(result[0].hasText).toBe(true);
      expect(result[1].hasText).toBe(false); // Image-only paragraph
      expect(result[2].hasText).toBe(true);
    });

    test('should handle paragraphs with text and images', () => {
      const text = 'Text with [image id=test] inline image';
      const paragraphPositions = calculateParagraphPositions(text);
      const result = findTextParagraphs(text, paragraphPositions);
      
      expect(result[0].hasText).toBe(true);
    });

    test('should handle empty text', () => {
      const text = '';
      const paragraphPositions = calculateParagraphPositions(text);
      const result = findTextParagraphs(text, paragraphPositions);
      
      expect(result).toHaveLength(1);
      expect(result[0].hasText).toBe(false);
    });
  });

  describe('removePlaceholders', () => {
    test('should remove placeholders from text segments', () => {
      const segments: TextSegment[] = [
        { type: 'text', content: 'Text with [image id=test] placeholder' }
      ];
      
      removePlaceholders(segments, ['[image id=test]']);
      
      expect(segments[0].content).toBe('Text with  placeholder');
    });

    test('should handle missing placeholders gracefully', () => {
      const segments: TextSegment[] = [
        { type: 'text', content: 'Text without images' }
      ];
      
      removePlaceholders(segments, ['[image id=test]']);
      
      expect(segments[0].content).toBe('Text without images');
    });

    test('should only affect text segments', () => {
      const segments: TextSegment[] = [
        { type: 'text', content: 'Text with [image id=test]' },
        { type: 'image', content: 'mock-image-element' }
      ];
      
      removePlaceholders(segments, ['[image id=test]']);
      
      expect(segments[0].content).toBe('Text with ');
      expect(segments[1].content).toBe('mock-image-element'); // Unchanged
    });

    test('should handle multiple placeholders', () => {
      const segments: TextSegment[] = [
        { type: 'text', content: 'Text with [image id=test1] and [image id=test2]' }
      ];
      
      removePlaceholders(segments, ['[image id=test1]', '[image id=test2]']);
      
      expect(segments[0].content).toBe('Text with  and ');
    });
  });

  describe('integration tests', () => {
    test('should properly process the sample beat text structure', () => {
      const sampleText = `From the sidelines, the city guards shift uneasily, their presence a constant reminder of the dangers you face. You meet the gaze of a stern-faced officer, and your heart quickens, but you hold your ground, your voice steady. "We will not be silenced," you assert, "not while injustice reigns."

The square buzzes with renewed energy, the crowd growing as more curious onlookers edge closer. You feel the weight of your outsider status, but also the spark of possibility. This moment, fragile and charged, could tip the balance in the struggle for goblin rights.

[image id=mizka_city_square_protest source=story desc="Mizka rallying protesters in City Square" float=right]`;

      // Step 1: Normalize text (this should fix the orphaned image)
      const normalizedText = normalizeStoryText(sampleText);
      
      // Step 2: Calculate paragraphs  
      const paragraphPositions = calculateParagraphPositions(normalizedText);
      
      // Step 3: Verify the image is attached to a text paragraph
      const textParagraphs = findTextParagraphs(normalizedText, paragraphPositions);
      const hasOrphanedImageParagraph = textParagraphs.some((p: { index: number; hasText: boolean }) => !p.hasText);
      
      // The image should be attached to the previous paragraph, so no orphaned paragraphs
      expect(hasOrphanedImageParagraph).toBe(false);
      expect(normalizedText).toContain('goblin rights. [image id=mizka_city_square_protest');
    });

    test('should handle multiple images properly', () => {
      const text = 'First paragraph [image id=img1]\n\nSecond paragraph\n\n[image id=img2]';
      
      const normalizedText = normalizeStoryText(text);
      const paragraphPositions = calculateParagraphPositions(normalizedText);
      
      // Should have 2 paragraphs with images attached, not orphaned
      expect(paragraphPositions.length).toBeLessThanOrEqual(2);
      expect(normalizedText).toContain('Second paragraph [image id=img2]');
    });

    test('should handle edge case of image at very beginning', () => {
      const text = '[image id=test]\n\nSome text paragraph';
      
      const normalizedText = normalizeStoryText(text);
      const paragraphPositions = calculateParagraphPositions(normalizedText);
      const textParagraphs = findTextParagraphs(normalizedText, paragraphPositions);
      
      // Should still result in valid paragraph structure
      expect(textParagraphs.some((p: { index: number; hasText: boolean }) => p.hasText)).toBe(true);
    });
  });
});
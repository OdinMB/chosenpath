import { useContext } from 'react';
import { StoryContext } from '../contexts/StoryContext';

export function useStory() {
  const context = useContext(StoryContext);
  if (context === undefined) {
    throw new Error("useStory must be used within a StoryProvider");
  }
  return context;
} 
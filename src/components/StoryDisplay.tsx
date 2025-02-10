import { useStory } from "../context/storyContext";
import ReactMarkdown from "react-markdown";

interface Props {
  onChoiceSelected: (optionIndex: number) => void;
}

export function StoryDisplay({ onChoiceSelected }: Props) {
  const { storyState, isLoading } = useStory();

  if (!storyState) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Story state not initialized</div>
      </div>
    );
  }

  if (isLoading && storyState.beatHistory.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">
          Generating your story's beginning...
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Generating next story beat...</div>
      </div>
    );
  }

  const currentBeat = storyState.beatHistory[storyState.beatHistory.length - 1];

  if (!currentBeat) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-600">Your story is about to begin...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="story-content">
        <h2 className="text-2xl font-bold mb-4">{currentBeat.title}</h2>
        <div className="prose prose-slate max-w-none">
          <ReactMarkdown>{currentBeat.text}</ReactMarkdown>
        </div>
      </div>

      <div className="choices space-y-3">
        <h3 className="text-lg font-semibold">What will you do?</h3>
        {currentBeat.options.map((option, index) => (
          <button
            key={index}
            onClick={() => onChoiceSelected(index)}
            className="block w-full text-left p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}

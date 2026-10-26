import { useId, useState, ReactNode } from "react";
import { Icons } from "components/ui";

interface FAQItem {
  question: string;
  answer: string | ReactNode;
}

interface LandingFAQProps {
  items: FAQItem[];
}

interface LandingFAQEntryProps {
  item: FAQItem;
  /** The answer's id, which the question button names as what it opens */
  answerId: string;
  isOpen: boolean;
  showDivider: boolean;
  onToggle: () => void;
}

/** One question and its answer, which stays in the page while closed but hidden. */
export function LandingFAQEntry({
  item,
  answerId,
  isOpen,
  showDivider,
  onToggle,
}: LandingFAQEntryProps) {
  return (
    <div>
      {showDivider && <div className="border-t border-primary-100" />}
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={answerId}
        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-primary-50 transition-colors"
      >
        <span className="font-semibold text-primary-800">{item.question}</span>
        {isOpen ? (
          <Icons.ChevronUp className="w-5 h-5 text-primary-600" />
        ) : (
          <Icons.ChevronDown className="w-5 h-5 text-primary-600" />
        )}
      </button>
      <div
        id={answerId}
        hidden={!isOpen}
        className="px-6 py-4 border-t border-primary-100"
      >
        <div className="text-primary-600 whitespace-pre-line">{item.answer}</div>
      </div>
    </div>
  );
}

export function LandingFAQ({ items }: LandingFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const idPrefix = useId();

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-white rounded-lg border border-primary-100 overflow-hidden">
      {items.map((item, index) => (
        <LandingFAQEntry
          key={index}
          item={item}
          answerId={`${idPrefix}-answer-${index}`}
          isOpen={openIndex === index}
          showDivider={index > 0}
          onToggle={() => toggleItem(index)}
        />
      ))}
    </div>
  );
}

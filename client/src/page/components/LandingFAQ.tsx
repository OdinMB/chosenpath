import { useState } from "react";
import { Icons } from "components/ui";

interface FAQItem {
  question: string;
  answer: string;
}

interface LandingFAQProps {
  items: FAQItem[];
}

export function LandingFAQ({ items }: LandingFAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="bg-white rounded-lg border border-primary-100 overflow-hidden">
      {items.map((item, index) => (
        <div key={index}>
          {index > 0 && <div className="border-t border-primary-100" />}
          <button
            onClick={() => toggleItem(index)}
            className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-primary-50 transition-colors"
          >
            <span className="font-semibold text-primary-800">
              {item.question}
            </span>
            {openIndex === index ? (
              <Icons.ChevronUp className="w-5 h-5 text-primary-600" />
            ) : (
              <Icons.ChevronDown className="w-5 h-5 text-primary-600" />
            )}
          </button>
          {openIndex === index && (
            <div className="px-6 py-4 border-t border-primary-100">
              <div className="text-primary-600 whitespace-pre-line">{item.answer}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

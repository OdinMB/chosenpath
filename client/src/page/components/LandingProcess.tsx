import { useState, ReactNode } from "react";

interface ProcessStep {
  number: number;
  title: string;
  description: string | ReactNode;
  imageSrc?: string;
}

interface LandingProcessProps {
  steps: ProcessStep[];
}

export function LandingProcess({ steps }: LandingProcessProps) {
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});

  const handleImageLoad = (stepNumber: number) => {
    setLoadedImages(prev => ({ ...prev, [stepNumber]: true }));
  };

  const handleImageError = (stepNumber: number) => {
    setLoadedImages(prev => ({ ...prev, [stepNumber]: false }));
  };

  return (
    <div className="bg-white rounded-lg border border-primary-100 overflow-hidden">
      {steps.map((step, index) => (
        <div key={step.number}>
          {index > 0 && <div className="border-t border-primary-100" />}
          <div className="flex">
            {step.imageSrc && (
              <div className="relative w-24 md:w-32 flex-shrink-0 overflow-hidden bg-gray-100">
                <img
                  src={step.imageSrc}
                  alt={step.title}
                  className={`w-full h-full md:h-auto md:object-center object-cover transition-all duration-500 ${
                    loadedImages[step.number] ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={() => handleImageLoad(step.number)}
                  onError={() => handleImageError(step.number)}
                />
              </div>
            )}
            <div className="flex-1 p-6">
              <h3 className="text-lg font-semibold mb-2 text-primary-800">
                {step.number}. {step.title}
              </h3>
              <div className="text-primary-600">{step.description}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

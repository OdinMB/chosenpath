interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator = ({ currentStep, totalSteps }: StepIndicatorProps) => {
  return (
    <div className="flex items-center justify-center mb-6">
      {Array.from({ length: totalSteps }, (_, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === currentStep;
        const isCompleted = stepNumber < currentStep;
        
        return (
          <div key={stepNumber} className="flex items-center">
            <div
              className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${isActive 
                  ? 'bg-accent text-white' 
                  : isCompleted 
                    ? 'bg-secondary text-white' 
                    : 'bg-primary-100 text-primary-400'
                }
              `}
            >
              {stepNumber}
            </div>
            {stepNumber < totalSteps && (
              <div
                className={`
                  w-16 h-0.5 mx-2
                  ${isCompleted ? 'bg-secondary' : 'bg-primary-100'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
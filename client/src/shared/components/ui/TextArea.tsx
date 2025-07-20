import React from "react";

interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  autoHeight?: boolean;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, id, name, className = "", rows = 3, autoHeight = false, ...props }, ref) => {
    const uniqueId = React.useId();
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textAreaRef = ref || internalRef;
    
    // Use provided id/name or fall back to generated uniqueId
    const inputId = id || name || uniqueId;

    const adjustHeight = React.useCallback(() => {
      if (autoHeight && textAreaRef && typeof textAreaRef !== 'function') {
        const textarea = textAreaRef.current;
        if (textarea) {
          // Reset height to auto to get the correct scrollHeight
          textarea.style.height = 'auto';
          // Set height to scrollHeight to fit content
          textarea.style.height = `${textarea.scrollHeight}px`;
        }
      }
    }, [autoHeight, textAreaRef]);

    React.useEffect(() => {
      if (autoHeight) {
        adjustHeight();
      }
    }, [props.value, adjustHeight, autoHeight]);

    const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
      if (autoHeight) {
        adjustHeight();
      }
      if (props.onInput) {
        props.onInput(e);
      }
    };

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            {label}
          </label>
        )}
        <textarea
          ref={textAreaRef}
          id={inputId}
          name={name || inputId}
          rows={autoHeight ? 1 : rows}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary ${autoHeight ? 'resize-none overflow-hidden' : ''} ${className}`}
          onInput={handleInput}
          {...props}
        />
      </div>
    );
  }
);

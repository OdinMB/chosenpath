import React from "react";

interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  autoHeight?: boolean;
  /** Optional minimum number of rows to enforce when autoHeight is enabled */
  minRows?: number;
  /** Optional minimum rows on small screens (<= 640px). Overrides minRows on mobile if provided */
  minRowsMobile?: number;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (
    {
      label,
      id,
      name,
      className = "",
      rows = 3,
      autoHeight = false,
      minRows,
      minRowsMobile,
      ...props
    },
    ref
  ) => {
    const uniqueId = React.useId();
    const internalRef = React.useRef<HTMLTextAreaElement>(null);
    const textAreaRef = ref || internalRef;

    // Use provided id/name or fall back to generated uniqueId
    const inputId = id || name || uniqueId;

    const [isMobile, setIsMobile] = React.useState<boolean>(() =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 640px)").matches
        : false
    );

    React.useEffect(() => {
      if (typeof window === "undefined") return;
      const mql = window.matchMedia("(max-width: 640px)");
      const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
      const mqlAny = mql as unknown as {
        addEventListener?: (
          type: string,
          listener: (e: MediaQueryListEvent) => void
        ) => void;
        removeEventListener?: (
          type: string,
          listener: (e: MediaQueryListEvent) => void
        ) => void;
        addListener?: (listener: (e: MediaQueryListEvent) => void) => void;
        removeListener?: (listener: (e: MediaQueryListEvent) => void) => void;
      };
      if (typeof mqlAny.addEventListener === "function") {
        mqlAny.addEventListener("change", handler);
      } else if (typeof mqlAny.addListener === "function") {
        // Fallback for older Safari
        mqlAny.addListener(handler);
      }
      return () => {
        if (typeof mqlAny.removeEventListener === "function") {
          mqlAny.removeEventListener("change", handler);
        } else if (typeof mqlAny.removeListener === "function") {
          mqlAny.removeListener(handler);
        }
      };
    }, []);

    const setMinHeightFromRows = React.useCallback(() => {
      const textarea =
        textAreaRef && typeof textAreaRef !== "function"
          ? textAreaRef.current
          : null;
      if (!textarea) return;
      const effectiveMinRows =
        isMobile && minRowsMobile ? minRowsMobile : minRows;
      if (effectiveMinRows && effectiveMinRows > 0) {
        const computed = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computed.lineHeight || "0");
        if (lineHeight) {
          const minHeightPx = lineHeight * effectiveMinRows;
          textarea.style.minHeight = `${minHeightPx}px`;
        }
      } else {
        // Clear any previously set min-height if minRows is not provided
        textarea.style.minHeight = "";
      }
    }, [minRows, minRowsMobile, isMobile, textAreaRef]);

    const adjustHeight = React.useCallback(() => {
      if (autoHeight && textAreaRef && typeof textAreaRef !== "function") {
        const textarea = textAreaRef.current;
        if (textarea) {
          // Reset height to auto to get the correct scrollHeight
          textarea.style.height = "auto";
          // Enforce a minimum height based on rows
          setMinHeightFromRows();
          // Set height to scrollHeight to fit content, but not below min-height
          const target = `${textarea.scrollHeight}px`;
          textarea.style.height = target;
        }
      }
    }, [autoHeight, textAreaRef, setMinHeightFromRows]);

    React.useEffect(() => {
      if (autoHeight) {
        setMinHeightFromRows();
        adjustHeight();
      }
    }, [props.value, adjustHeight, autoHeight, setMinHeightFromRows]);

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
          className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary ${
            autoHeight ? "resize-none overflow-hidden" : ""
          } ${className}`}
          onInput={handleInput}
          {...props}
        />
      </div>
    );
  }
);

import React, { useState, useRef, ReactNode } from "react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
  arrow,
} from "@floating-ui/react";

type Position =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-start"
  | "top-end"
  | "right-start"
  | "right-end"
  | "bottom-start"
  | "bottom-end"
  | "left-start"
  | "left-end";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  position?: Position;
  delay?: number;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  position = "top",
  delay = 200,
  className = "",
  contentClassName = "",
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const arrowRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: position,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "start",
        crossAxis: false,
      }),
      shift({ padding: 8 }),
      arrow({
        element: arrowRef,
      }),
    ],
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: delay, close: 100 },
    enabled: !disabled,
  });
  const focus = useFocus(context, { enabled: !disabled });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        className={className}
        style={{ display: "inline-block" }}
      >
        {children}
      </div>
      <FloatingPortal>
        {isOpen && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className={`z-[9999] px-3 py-2 text-sm bg-white text-primary rounded-lg border border-primary-100 shadow-md animate-fadeIn ${contentClassName}`}
          >
            {content}
            <div
              ref={arrowRef}
              className="absolute w-0 h-0 border-4 border-transparent border-t-white"
              style={{
                transform: "translateX(-50%)",
                bottom: "-4px",
                left: "50%",
              }}
            />
          </div>
        )}
      </FloatingPortal>
    </>
  );
};

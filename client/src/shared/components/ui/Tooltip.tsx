import React, {
  useState,
  useRef,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import "./tooltip.css";

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
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const [adjustedPosition, setAdjustedPosition] = useState<Position>(position);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Calculate tooltip position based on the target element
  const calculatePosition = useCallback(() => {
    if (!targetRef.current || !tooltipRef.current) return;

    const targetRect = targetRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const spacing = 8; // Space between target and tooltip

    let top = 0;
    let left = 0;
    let newPosition = position;

    // Calculate initial position based on requested position
    switch (position) {
      case "top":
        top = targetRect.top - tooltipRect.height - spacing;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;
      case "top-start":
        top = targetRect.top - tooltipRect.height - spacing;
        left = targetRect.left;
        break;
      case "top-end":
        top = targetRect.top - tooltipRect.height - spacing;
        left = targetRect.right - tooltipRect.width;
        break;
      case "right":
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.right + spacing;
        break;
      case "right-start":
        top = targetRect.top;
        left = targetRect.right + spacing;
        break;
      case "right-end":
        top = targetRect.bottom - tooltipRect.height;
        left = targetRect.right + spacing;
        break;
      case "bottom":
        top = targetRect.bottom + spacing;
        left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
        break;
      case "bottom-start":
        top = targetRect.bottom + spacing;
        left = targetRect.left;
        break;
      case "bottom-end":
        top = targetRect.bottom + spacing;
        left = targetRect.right - tooltipRect.width;
        break;
      case "left":
        top = targetRect.top + (targetRect.height - tooltipRect.height) / 2;
        left = targetRect.left - tooltipRect.width - spacing;
        break;
      case "left-start":
        top = targetRect.top;
        left = targetRect.left - tooltipRect.width - spacing;
        break;
      case "left-end":
        top = targetRect.bottom - tooltipRect.height;
        left = targetRect.left - tooltipRect.width - spacing;
        break;
    }

    // Check if tooltip is going outside viewport and adjust if needed
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate absolute positions relative to viewport
    const absTop = top;
    const absLeft = left;
    const absRight = left + tooltipRect.width;
    const absBottom = top + tooltipRect.height;

    // Adjust for viewport overflow
    if (absTop < 0) {
      // If tooltip goes above viewport, flip to bottom
      if (position.startsWith("top")) {
        top = targetRect.bottom + spacing;
        newPosition = position.replace("top", "bottom") as Position;
      }
    }

    if (absBottom > viewportHeight) {
      // If tooltip goes below viewport, flip to top
      if (position.startsWith("bottom")) {
        top = targetRect.top - tooltipRect.height - spacing;
        newPosition = position.replace("bottom", "top") as Position;
      }
    }

    if (absLeft < 0) {
      // If tooltip goes beyond left edge
      if (position.startsWith("left")) {
        left = targetRect.right + spacing;
        newPosition = position.replace("left", "right") as Position;
      } else {
        // Center align if possible
        left = spacing;
      }
    }

    if (absRight > viewportWidth) {
      // If tooltip goes beyond right edge
      if (position.startsWith("right")) {
        left = targetRect.left - tooltipRect.width - spacing;
        newPosition = position.replace("right", "left") as Position;
      } else {
        // Right align
        left = viewportWidth - tooltipRect.width - spacing;
      }
    }

    setTooltipPosition({ top, left });
    setAdjustedPosition(newPosition);
  }, [position]);

  useEffect(() => {
    // Update position when visibility changes
    if (isVisible) {
      // Initial calculation
      calculatePosition();

      // Use requestAnimationFrame for the second calculation
      // to ensure the tooltip is rendered before calculating its position
      const rafId = requestAnimationFrame(() => {
        calculatePosition();
      });

      window.addEventListener("resize", calculatePosition);
      window.addEventListener("scroll", calculatePosition);

      return () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", calculatePosition);
        window.removeEventListener("scroll", calculatePosition);
      };
    }

    return undefined;
  }, [isVisible, calculatePosition]);

  const handleMouseEnter = () => {
    if (disabled) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = window.setTimeout(() => {
      setIsVisible(false);
    }, 100); // Small delay before hiding for better UX
  };

  // Get tooltip arrow direction based on position
  const getArrowClass = (): string => {
    if (adjustedPosition.startsWith("top")) return "tooltip-arrow-top";
    if (adjustedPosition.startsWith("right")) return "tooltip-arrow-right";
    if (adjustedPosition.startsWith("bottom")) return "tooltip-arrow-bottom";
    if (adjustedPosition.startsWith("left")) return "tooltip-arrow-left";
    return "";
  };

  return (
    <div
      ref={targetRef}
      className={`${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      style={{ display: "inline-block" }}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`fixed z-[9999] px-3 py-2 text-sm bg-white text-primary rounded-lg border border-primary-100 shadow-md ${getArrowClass()} ${contentClassName} animate-fadeIn`}
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { Trash2 } from "lucide-react";

interface Props {
  swipeEnabled: boolean;
  onSwipeRemove?: () => void;
  onLongPress?: (x: number, y: number) => void;
  children: ReactNode;
  className?: string;
}

export function SwipeableQueueRow({
  swipeEnabled,
  onSwipeRemove,
  onLongPress,
  children,
  className = "",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const modeRef = useRef<"idle" | "swipe" | "scroll" | "longpress">("idle");
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offsetRef = useRef(0);

  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);

  const clearTimers = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimers();
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    };
  }, []);

  const triggerSuppressClick = () => {
    suppressClickRef.current = true;
    if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    suppressTimerRef.current = setTimeout(() => {
      suppressClickRef.current = false;
    }, 380);
  };

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    if (removing || e.touches.length !== 1) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("[data-drag-handle='true'], button, a, input")) {
      return;
    }

    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    modeRef.current = "idle";
    offsetRef.current = 0;
    setOffsetX(0);

    clearTimers();
    if (onLongPress) {
      const startX = touch.clientX;
      const startY = touch.clientY;
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        if (modeRef.current === "idle") {
          modeRef.current = "longpress";
          triggerSuppressClick();
          try {
            navigator.vibrate?.(15);
          } catch {
            // Ignore vibration restrictions
          }
          onLongPress(startX, startY);
        }
      }, 450);
    }
  };

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start || e.touches.length !== 1 || removing) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (modeRef.current === "longpress" || modeRef.current === "scroll") {
      return;
    }

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimers();
    }

    if (modeRef.current === "idle") {
      if (swipeEnabled && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.35) {
        modeRef.current = "swipe";
        setDragging(true);
      } else if (Math.abs(dy) > 12) {
        modeRef.current = "scroll";
        return;
      } else {
        return;
      }
    }

    if (modeRef.current === "swipe") {
      e.preventDefault();
      offsetRef.current = dx;
      setOffsetX(dx);
    }
  };

  const handleTouchEnd = () => {
    clearTimers();
    const start = touchStartRef.current;
    touchStartRef.current = null;

    if (!start) return;
    if (modeRef.current !== "swipe") {
      modeRef.current = "idle";
      return;
    }

    const dx = offsetRef.current;
    const width = containerRef.current?.offsetWidth || 320;
    const threshold = Math.min(110, width * 0.3);

    setDragging(false);
    modeRef.current = "idle";

    if (Math.abs(dx) >= threshold && onSwipeRemove) {
      triggerSuppressClick();
      setRemoving(true);
      const exitX = dx > 0 ? width + 40 : -(width + 40);
      offsetRef.current = exitX;
      setOffsetX(exitX);
      setTimeout(() => {
        onSwipeRemove();
      }, 180);
    } else {
      if (Math.abs(dx) > 12) {
        triggerSuppressClick();
      }
      offsetRef.current = 0;
      setOffsetX(0);
    }
  };

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const showBackdrop = Math.abs(offsetX) > 4;
  const swipeRight = offsetX > 0;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClickCapture={handleClickCapture}
      className={`relative overflow-hidden touch-pan-y select-none ${className}`}
    >
      {showBackdrop && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center bg-[#ef4444] px-5 ${
            swipeRight ? "justify-start" : "justify-end"
          }`}
        >
          <Trash2 className="h-5 w-5 text-white" />
        </div>
      )}
      <div
        style={{
          transform: offsetX !== 0 ? `translateX(${offsetX}px)` : undefined,
        }}
        className={`relative ${
          dragging ? "" : "transition-transform duration-200 ease-out"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

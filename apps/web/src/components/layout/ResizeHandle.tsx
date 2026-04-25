"use client";

import { useRef, useCallback, type PointerEvent } from "react";

interface ResizeHandleProps {
  /** Called continuously with incremental px delta while dragging. */
  onResize: (delta: number) => void;
  /** "ltr" = rightward drag grows the adjacent panel (sidebar).
   *  "rtl" = leftward drag grows the adjacent panel (detail).  */
  direction?: "ltr" | "rtl";
  className?: string;
}

export function ResizeHandle({ onResize, direction = "ltr", className = "" }: ResizeHandleProps) {
  const lastX = useRef<number | null>(null);

  const onPointerDown = useCallback((e: PointerEvent<HTMLDivElement>) => {
    lastX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, []);

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (lastX.current === null || e.buttons === 0) return;
      const raw = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(direction === "rtl" ? -raw : raw);
    },
    [onResize, direction],
  );

  const onPointerUp = useCallback(() => {
    lastX.current = null;
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      className={`resize-handle ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}

import { useEffect, useRef, useState } from 'react';

interface UseResizableWidthOptions {
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readStoredWidth(options: UseResizableWidthOptions) {
  try {
    const raw = localStorage.getItem(options.storageKey);
    if (!raw) return options.defaultWidth;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return options.defaultWidth;
    return clamp(parsed, options.minWidth, options.maxWidth);
  } catch {
    return options.defaultWidth;
  }
}

export function useResizableWidth(options: UseResizableWidthOptions) {
  const [width, setWidth] = useState(() => readStoredWidth(options));
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(options.storageKey, String(width));
    } catch {
      // noop
    }
  }, [options.storageKey, width]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const nextWidth = drag.startWidth + (event.clientX - drag.startX);
      setWidth(clamp(nextWidth, options.minWidth, options.maxWidth));
    };

    const onPointerEnd = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
    };
  }, [options.maxWidth, options.minWidth]);

  const startResize = (event: React.PointerEvent<HTMLElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const resetWidth = () => setWidth(options.defaultWidth);

  return { width, startResize, resetWidth };
}


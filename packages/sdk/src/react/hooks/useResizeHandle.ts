/**
 * useResizeHandle — headless drag-to-resize behavior.
 *
 * Owns pointer capture, min-size clamping, and body cursor/selection
 * management during a drag. Renders nothing: spread `getHandleProps(dir)`
 * onto any element you style as a handle, and size the target from the
 * `onResize` callback (typically by writing width/height into state).
 *
 * ```tsx
 * const ref = useRef<HTMLDivElement>(null);
 * const { getHandleProps } = useResizeHandle({
 *   targetRef: ref,
 *   minWidth: 200,
 *   onResize: ({ width, height }) => setSize({ width, height }),
 * });
 * <div ref={ref} style={{ width: size?.width, height: size?.height }}>
 *   <div {...getHandleProps('se')} className="my-corner-handle" />
 * </div>
 * ```
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export type ResizeHandleDirection = 'e' | 's' | 'se';

export interface ResizeHandleSize {
  width: number;
  height: number;
}

export interface UseResizeHandleOptions {
  /** Element whose size is being adjusted (measured at drag start). */
  targetRef: RefObject<HTMLElement | null>;
  /** Called on every pointer move with the clamped size. */
  onResize: (size: ResizeHandleSize) => void;
  onResizeStart?: (direction: ResizeHandleDirection) => void;
  onResizeEnd?: (size: ResizeHandleSize) => void;
  minWidth?: number;
  minHeight?: number;
  disabled?: boolean;
}

export interface ResizeHandleProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  'data-resize-handle': ResizeHandleDirection;
  /** Structural: direction cursor + touch-action none (override by spreading your own style after). */
  style: CSSProperties;
}

export interface UseResizeHandleResult {
  getHandleProps: (direction: ResizeHandleDirection) => ResizeHandleProps;
  isResizing: boolean;
}

const CURSORS: Record<ResizeHandleDirection, CSSProperties['cursor']> = {
  e: 'ew-resize',
  s: 'ns-resize',
  se: 'nwse-resize',
};

export function useResizeHandle({
  targetRef,
  onResize,
  onResizeStart,
  onResizeEnd,
  minWidth = 0,
  minHeight = 0,
  disabled = false,
}: UseResizeHandleOptions): UseResizeHandleResult {
  const [isResizing, setIsResizing] = useState(false);

  const onResizeRef = useRef(onResize);
  const onResizeStartRef = useRef(onResizeStart);
  const onResizeEndRef = useRef(onResizeEnd);
  const minWidthRef = useRef(minWidth);
  const minHeightRef = useRef(minHeight);
  const disabledRef = useRef(disabled);
  onResizeRef.current = onResize;
  onResizeStartRef.current = onResizeStart;
  onResizeEndRef.current = onResizeEnd;
  minWidthRef.current = minWidth;
  minHeightRef.current = minHeight;
  disabledRef.current = disabled;

  /** Tear down an in-flight drag (listeners removed with the handle element). */
  const endDragRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      endDragRef.current?.();
    };
  }, []);

  const getHandleProps = useCallback(
    (direction: ResizeHandleDirection): ResizeHandleProps => ({
      'data-resize-handle': direction,
      style: { cursor: CURSORS[direction], touchAction: 'none' },
      onPointerDown: (event) => {
        if (disabledRef.current) return;
        const target = targetRef.current;
        if (!target) return;

        event.preventDefault();
        event.stopPropagation();

        const handleEl = event.currentTarget;
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = target.offsetWidth;
        const startHeight = target.offsetHeight;
        let lastSize: ResizeHandleSize = {
          width: startWidth,
          height: startHeight,
        };

        const handleMove = (moveEvent: PointerEvent): void => {
          const deltaX = moveEvent.clientX - startX;
          const deltaY = moveEvent.clientY - startY;
          const width =
            direction === 's'
              ? startWidth
              : Math.max(minWidthRef.current, startWidth + deltaX);
          const height =
            direction === 'e'
              ? startHeight
              : Math.max(minHeightRef.current, startHeight + deltaY);
          lastSize = { width, height };
          onResizeRef.current(lastSize);
        };

        const endDrag = (): void => {
          endDragRef.current = null;
          handleEl.removeEventListener('pointermove', handleMove);
          handleEl.removeEventListener('pointerup', handleUp);
          handleEl.removeEventListener('pointercancel', handleUp);
          if (handleEl.hasPointerCapture?.(pointerId)) {
            handleEl.releasePointerCapture(pointerId);
          }
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          setIsResizing(false);
        };

        const handleUp = (): void => {
          endDrag();
          onResizeEndRef.current?.(lastSize);
        };

        // Capture so the drag survives leaving the handle (and the window).
        handleEl.setPointerCapture?.(pointerId);
        handleEl.addEventListener('pointermove', handleMove);
        handleEl.addEventListener('pointerup', handleUp);
        handleEl.addEventListener('pointercancel', handleUp);
        endDragRef.current = endDrag;

        document.body.style.cursor = CURSORS[direction] ?? '';
        document.body.style.userSelect = 'none';
        setIsResizing(true);
        onResizeStartRef.current?.(direction);
      },
    }),
    [targetRef]
  );

  return { getHandleProps, isResizing };
}

export default useResizeHandle;

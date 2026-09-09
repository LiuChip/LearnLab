import { useRef } from 'preact/hooks';

export function ResizeHandle({
  label,
  value,
  min,
  max,
  onChange,
  horizontal = false,
  reverse = false
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (size: number) => void;
  horizontal?: boolean;
  reverse?: boolean;
}) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const change = (value: number) => onChange(Math.min(max, Math.max(min, value)));
  return (
    <div
      class={`resize-handle ${horizontal ? 'resize-horizontal' : 'resize-vertical'}`}
      role="separator"
      aria-label={label}
      aria-orientation={horizontal ? 'horizontal' : 'vertical'}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag.current = { start: horizontal ? event.clientY : event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current)
          change(
            drag.current.value +
              ((horizontal ? event.clientY : event.clientX) - drag.current.start) *
                (reverse ? -1 : 1)
          );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        const amount =
          event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? -10
            : event.key === 'ArrowRight' || event.key === 'ArrowDown'
              ? 10
              : 0;
        if (amount) {
          event.preventDefault();
          change(value + amount * (reverse ? -1 : 1));
        }
      }}
    />
  );
}

import { useRef } from 'preact/hooks';

interface ResizeHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  horizontal?: boolean;
  reverse?: boolean;
}

export function ResizeHandle({
  label,
  value,
  min,
  max,
  onChange,
  horizontal = false,
  reverse = false
}: ResizeHandleProps) {
  const drag = useRef<{ start: number; value: number } | null>(null);
  const change = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  return (
    <div
      class={`workbench-resize-handle ${horizontal ? 'is-horizontal' : 'is-vertical'}`}
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
        if (!drag.current) return;
        const current = horizontal ? event.clientY : event.clientX;
        change(drag.current.value + (current - drag.current.start) * (reverse ? -1 : 1));
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={(event) => {
        const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -10
          : event.key === 'ArrowRight' || event.key === 'ArrowDown'
            ? 10
            : 0;
        if (!delta) return;
        event.preventDefault();
        change(value + delta * (reverse ? -1 : 1));
      }}
    />
  );
}

import type { JSX } from 'preact';

interface IconProps extends JSX.HTMLAttributes<HTMLSpanElement> {
  glyph: string;
  label?: string;
  active?: boolean;
}

export function Icon({ glyph, label, active, class: className, ...props }: IconProps) {
  return (
    <span class={`icon-placeholder${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`} aria-hidden={label ? undefined : true} title={label} {...props}>
      {glyph}
    </span>
  );
}

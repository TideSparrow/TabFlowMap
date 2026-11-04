import { useState, type MouseEvent, type ReactNode } from "react";
import { MapTooltip } from "../MapTooltip";

export function TaskNavigationButton({ label, tip, className, disabled, onNavigate, children }: {
  label: string; tip: string; className: string; disabled: boolean;
  onNavigate: () => void; children: ReactNode;
}) {
  const [ripple, setRipple] = useState<{ x: number; y: number; size: number; id: number } | null>(null);
  function click(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.detail ? event.clientX - bounds.left : bounds.width / 2;
    const y = event.detail ? event.clientY - bounds.top : bounds.height / 2;
    const size = 2 * Math.hypot(Math.max(x, bounds.width - x), Math.max(y, bounds.height - y));
    setRipple({ x, y, size, id: performance.now() });
    onNavigate();
  }
  return <MapTooltip label={tip}>
    <button className={`tm-main-task-arrow ${className}`} type="button" aria-label={label} disabled={disabled} onClick={click}>
      {ripple && <span key={ripple.id} className="tm-main-task-ripple" aria-hidden="true"
        style={{ left: ripple.x, top: ripple.y, width: ripple.size, height: ripple.size }}
        onAnimationEnd={() => setRipple((current) => current?.id === ripple.id ? null : current)} />}
      {children}
    </button>
  </MapTooltip>;
}

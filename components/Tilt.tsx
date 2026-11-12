"use client";

import { useRef } from "react";

/**
 * Tilts its content in 3D toward the pointer, like a card held under a light. Mouse only:
 * touch and reduced-motion users get the flat card (see .tilt in globals.css).
 */
export function Tilt({ children, className = "", max = 6, style }: { children: React.ReactNode; className?: string; max?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function move(e: React.PointerEvent) {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      el.setAttribute("data-tilting", "");
    });
  }

  function leave() {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.removeAttribute("data-tilting");
    for (const p of ["--rx", "--ry"]) el.style.removeProperty(p);
  }

  return (
    <div ref={ref} className={`tilt ${className}`} style={style} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </div>
  );
}

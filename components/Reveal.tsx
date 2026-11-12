"use client";

import { useEffect, useRef } from "react";

/**
 * Reveals its children as they scroll into view. The hidden state is applied by this effect,
 * and only to elements still below the fold, so without script (or before hydration) everything
 * is simply visible and nothing on screen ever flashes.
 */
export function Reveal({ children, className = "", delay = 0, as: Tag = "div" }: { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "article" }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.setAttribute("data-hidden", "");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.removeAttribute("data-hidden");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    // @ts-expect-error one ref type for the few block tags this renders
    <Tag ref={ref} className={`reveal ${className}`} style={delay ? ({ "--d": `${delay}ms` } as React.CSSProperties) : undefined}>
      {children}
    </Tag>
  );
}

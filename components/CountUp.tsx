"use client";

import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A number that counts to its value: from zero the first time it is seen, and from the old
 * value whenever it changes (a live sale landing). Renders the final value on the server.
 */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef<number | null>(null);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const start = from.current ?? 0;
    from.current = value;
    if (start === value || reduced()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        setShown(start + (value - start) * (1 - Math.pow(1 - t, 4)));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    // Wait until the number is on screen, so the count is actually seen.
    const node = el.current;
    if (!node || !("IntersectionObserver" in window)) {
      run();
      return () => cancelAnimationFrame(raf);
    }
    setShown(start);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      run();
    });
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return <span ref={el}>{format(shown)}</span>;
}

/**
 * Product artwork drawn in the page's own line style. The catalog stores a symbol per product;
 * this maps each one to a simple icon so product tiles match the rest of the interface.
 */
const ICONS: Record<string, React.ReactNode> = {
  cup: (
    <>
      <path d="M5 9h11v4.5a5.5 5.5 0 0 1-11 0V9Z" />
      <path d="M16 10.5h1.2a2.3 2.3 0 0 1 0 4.6H15.6" />
      <path d="M8 3.5c0 1 1 1.2 1 2.2M11.5 3.5c0 1 1 1.2 1 2.2" />
      <path d="M4 20.5h13" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14Z" />
      <path d="M5 19c3-5 6-8 10-10" />
    </>
  ),
  box: (
    <>
      <path d="m12 3 8 4.2v9.6L12 21l-8-4.2V7.2L12 3Z" />
      <path d="m4 7.2 8 4.2 8-4.2M12 11.4V21" />
    </>
  ),
  grinder: (
    <>
      <path d="M8 3.5h8l-1.6 4.2H9.6L8 3.5Z" />
      <rect x="7.5" y="7.7" width="9" height="12.3" rx="1.6" />
      <path d="M16.5 11h2.7V8.6M10 16h4" />
    </>
  ),
  kettle: (
    <>
      <path d="M7 10h8l1.5 9h-11L7 10Z" />
      <path d="M8.5 10a2.5 2.5 0 0 1 5 0M15.4 12.5c2.6-.4 3.6-2.6 4.6-5.5M7 12.5H5.4a1.9 1.9 0 0 0 0 3.8h.9" />
    </>
  ),
  scale: (
    <>
      <rect x="4" y="12" width="16" height="7.5" rx="2" />
      <path d="M7 12V9.5h10V12M9.5 15.8h5" />
      <path d="M12 9.5V6" />
    </>
  ),
  bread: (
    <>
      <path d="M4.5 11.5c-1.6-3 1-6 4.2-5.4 1.7-2.2 5-2.2 6.6 0 3.2-.6 5.8 2.4 4.2 5.4V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18v-6.5Z" />
      <path d="M9 12v3.5M12 12v3.5M15 12v3.5" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3.5h6v3l1.5 2V19a1.5 1.5 0 0 1-1.5 1.5H9A1.5 1.5 0 0 1 7.5 19V8.5L9 6.5v-3Z" />
      <path d="M7.5 12h9" />
    </>
  ),
  flame: (
    <>
      <path d="M12 3c.5 3.5 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.2 1.8 1 2.5 1.8 2.8C10.5 9 10.5 5.5 12 3Z" />
    </>
  ),
  bag: (
    <>
      <path d="M5.5 8.5h13l1 11.5h-15l1-11.5Z" />
      <path d="M9 8.5V7a3 3 0 0 1 6 0v1.5" />
    </>
  ),
};

const BY_SYMBOL: Record<string, keyof typeof ICONS> = {
  "☕": "cup", "🌙": "cup", "🧊": "cup", "🥤": "cup",
  "🌸": "leaf", "🍵": "leaf", "🌶️": "leaf",
  "📦": "box", "🍱": "box", "👜": "bag",
  "⚙️": "grinder",
  "🫖": "kettle", "🔻": "kettle",
  "⚖️": "scale",
  "🥖": "bread", "🥐": "bread", "🍞": "bread",
  "🧴": "flask",
  "🔥": "flame",
};

export function ProductArt({ symbol, className = "" }: { symbol: string; className?: string }) {
  return (
    <div className={`grid place-items-center bg-bg text-[var(--steel)] ${className}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[46%] w-[46%]" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[BY_SYMBOL[symbol] ?? "bag"]}
      </svg>
    </div>
  );
}

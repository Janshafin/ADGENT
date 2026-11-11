/** Simple status glyphs drawn in SVG, so they match the type and colour system (no emoji). */
export function StatusMark({ kind }: { kind: "done" | "error" | "working" | "cancelled" }) {
  if (kind === "working") {
    return <span className="mx-auto block h-11 w-11 animate-spin rounded-full border-[3px] border-line border-t-pp" aria-label="Working" />;
  }
  const color = kind === "done" ? "var(--good)" : kind === "error" ? "var(--bad)" : "var(--muted)";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="mx-auto" aria-hidden>
      <circle cx="22" cy="22" r="22" fill={color} />
      {kind === "done" && <path d="M13 22.5l6 6 12-13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === "error" && <path d="M22 12v13M22 31v.5" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />}
      {kind === "cancelled" && <path d="M15 15l14 14M29 15L15 29" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />}
    </svg>
  );
}

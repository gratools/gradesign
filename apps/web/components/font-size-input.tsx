"use client";
import { useEffect, useState } from "react";
export default function FontSizeInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(Math.round(value)));
  useEffect(() => setDraft(String(Math.round(value))), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) {
      const size = Math.min(240, Math.max(8, parsed));
      onChange(size); setDraft(String(size));
    } else setDraft(String(Math.round(value)));
  };
  return <input className="font-size" type="number" aria-label="Font size" min={8} max={240}
    value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />;
}

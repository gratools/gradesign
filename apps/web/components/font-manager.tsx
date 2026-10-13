"use client";
import { useState, useRef, useEffect } from "react";
import { Upload, LoaderCircle } from "lucide-react";
import { Button } from "./ui/button";
import { importCustomFont, registerCustomFonts, validateCustomFontCollection, type CustomFont } from "@/lib/fonts";

export default function FontManager({ fonts, disabled, onAdd, notify }: {
  fonts: CustomFont[]; disabled: boolean; onAdd: (font: CustomFont) => void; notify: (message: string) => void;
}) {
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState("400");
  const [style, setStyle] = useState<"normal" | "italic">("normal");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return <div className="font-manager">
    <div className="section-label">Your custom fonts</div>
    <p className="micro-copy">Upload a font you have permission to use. It travels with your editable project.</p>
    {fonts.map(font => <div className="custom-font-row" key={font.id}>
      <b style={{ fontFamily: font.family }}>{font.family}</b><small>{font.weight} · {font.style}</small>
    </div>)}
    <form className="font-upload-form" onSubmit={async e => {
      e.preventDefault(); if (!file || disabled || busy) return;
      setBusy(true);
      try {
        const font = await importCustomFont(file, family.trim(), weight, style);
        if (!mounted.current) return;
        if (!validateCustomFontCollection([...fonts, font])) throw new Error("This font face already exists, or the collection exceeds 20 faces / 12 MB.");
        await registerCustomFonts([...fonts, font]);
        if (!mounted.current) return;
        onAdd(font); setFile(undefined); setInputKey(k => k + 1); notify(`${font.family} added to your fonts`);
      } catch (error) { notify(error instanceof Error ? error.message : "Unable to load this font."); }
      finally { setBusy(false); }
    }}>
      <label>Font family name<input aria-label="Custom font family name" placeholder="e.g. My Brand Sans" value={family} maxLength={64} required disabled={disabled || busy} onChange={e => setFamily(e.target.value)} /></label>
      <div className="font-face-options">
        <label>Weight<select aria-label="Custom font weight" value={weight} onChange={e => setWeight(e.target.value)} disabled={disabled || busy}>
          {[100,200,300,400,500,600,700,800,900].map(n => <option value={n} key={n}>{n}{n === 400 ? " · Regular" : n === 700 ? " · Bold" : ""}</option>)}
        </select></label>
        <label>Style<select aria-label="Custom font style" value={style} onChange={e => setStyle(e.target.value as "normal" | "italic")} disabled={disabled || busy}><option value="normal">Normal</option><option value="italic">Italic</option></select></label>
      </div>
      <input key={inputKey} type="file" aria-label="Custom font file" accept=".woff2,.woff,.ttf,.otf" required disabled={disabled || busy} onChange={e => setFile(e.target.files?.[0])} />
      <small>WOFF2, WOFF, TTF, OTF · up to 3 MB each</small>
      <Button type="submit" variant="secondary" disabled={disabled || busy || !file || !family.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <Upload size={16} />}Add custom font</Button>
      {disabled && <p className="micro-copy">Leave live editing to add fonts, then save the project before sharing.</p>}
    </form>
  </div>;
}

"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

export default function ColorPicker({ value, colors, onChange, label, capture }: {
  value: string; colors: string[]; onChange: (color: string) => void;
  label: string; capture?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState(value);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="color-swatch" aria-label={label} title={label}
      style={{ background: /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff" }}
      onPointerDown={() => capture?.()} onClick={() => setHex(value)} /></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content color-dialog">
      <Dialog.Title>{label}</Dialog.Title>
      <Dialog.Description>Choose a brand color or enter a custom color.</Dialog.Description>
      <Dialog.Close className="dialog-close" aria-label="Close color picker"><X size={20} /></Dialog.Close>
      <div className="section-label">Brand colors</div>
      <div className="brand-colors">{colors.map((color, i) => <button key={i}
        aria-label={`Use brand color ${color}`} title={color} style={{ background: color }}
        onClick={() => { onChange(color); setHex(color); setOpen(false); }} />)}</div>
      <label className="brand-color-row">Custom color
        <input type="color" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#ffffff"}
          onChange={e => { setHex(e.target.value); onChange(e.target.value); }} />
        <input aria-label="Hex color" value={hex} maxLength={7} onChange={e => {
          setHex(e.target.value); if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
        }} />
      </label>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

"use client";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Maximize2, X } from "lucide-react";
import { PRESENTATION_SIZES } from "@/lib/document-size";
import { Button } from "./ui/button";

export default function SizePicker({ width, height, pageCount, onResize, disabled }: {
  width: number; height: number; pageCount: number; disabled: boolean;
  onResize: (width: number, height: number, all: boolean, fit: boolean) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState<string>("16:9");
  const [all, setAll] = useState(true);
  const [fit, setFit] = useState(true);
  const [busy, setBusy] = useState(false);
  const current = PRESENTATION_SIZES.find(s => s.width === width && s.height === height);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><button className="toolbar-button size-control" disabled={disabled} onClick={() => setRatio(current?.id ?? "16:9")}><Maximize2 size={16} />Resize <span>{current?.id === "legacy" ? "3:2" : current?.id ?? "Custom"}</span></button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content size-picker">
      <Dialog.Title>Presentation size</Dialog.Title><Dialog.Description>Choose the proportions for your presentation.</Dialog.Description>
      <Dialog.Close className="dialog-close" aria-label="Close presentation size"><X size={20} /></Dialog.Close>
      <div className="size-options" role="radiogroup" aria-label="Presentation aspect ratio">{PRESENTATION_SIZES.map(size => <button role="radio" aria-checked={ratio === size.id} key={size.id} onClick={() => setRatio(size.id)} className={ratio === size.id ? "selected" : ""}>
        <span className="size-preview" style={{ width: 46 * Math.min(1, size.width / size.height), height: 46 * Math.min(1, size.height / size.width) }} />
        <b>{size.label}</b><small>{size.width} × {size.height}</small>
      </button>)}</div>
      <label className="checkbox-label"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} />Apply to all {pageCount} pages</label>
      <label className="checkbox-label"><input type="checkbox" checked={fit} onChange={e => setFit(e.target.checked)} />Scale and center existing artwork</label>
      <Button disabled={busy} onClick={async () => { const size = PRESENTATION_SIZES.find(s => s.id === ratio)!; setBusy(true); try { await onResize(size.width, size.height, all, fit); setOpen(false); } finally { setBusy(false); } }}>Apply size</Button>
    </Dialog.Content></Dialog.Portal>
  </Dialog.Root>;
}

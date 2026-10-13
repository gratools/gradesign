"use client";
import { useEffect, useRef, useState } from "react";
import { getCanvasSize } from "@/lib/document-size";
import { ensureFontsForCanvas } from "@/lib/fonts";
import { validateCanvasJSON } from "@/lib/canvas-types";
import type { Project } from "@/lib/project";
import styles from "./presentation.module.css";

type Tool = "pointer" | "pen" | "line" | "box" | "circle" | "note";
type Mark = { tool: Tool; points: [number, number][]; color: string; width: number; text?: string };
export default function Presentation({ project, initialPage, onExit }: { project: Project; initialPage: number; onExit: () => void }) {
  const [page, setPage] = useState(initialPage), [zoom, setZoom] = useState(1), [tool, setTool] = useState<Tool>("pointer");
  const [color, setColor] = useState("#ff3355"), [width, setWidth] = useState(5), [note, setNote] = useState("");
  const [marks, setMarks] = useState<Record<string, Mark[]>>({}), [draft, setDraft] = useState<Mark | null>(null);
  const [image, setImage] = useState(""), [error, setError] = useState("");
  const [viewport, setViewport] = useState({ width: 1000, height: 650 });
  const area = useRef<HTMLDivElement>(null), drawing = useRef<Mark | null>(null);
  const current = project.pages[page], size = getCanvasSize(current.canvas);
  const scale = Math.max(.02, Math.min((viewport.width - 40) / size.width, (viewport.height - 40) / size.height)) * zoom;
  useEffect(() => { if (!area.current) return; const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })); observer.observe(area.current); return () => observer.disconnect(); }, []);
  useEffect(() => {
    let cancelled = false;
    setImage(""); setError(""); setDraft(null); drawing.current = null;
    void (async () => {
      const { StaticCanvas } = await import("fabric");
      const canvas = new StaticCanvas(undefined, size);
      try {
        await ensureFontsForCanvas(current.canvas, project.fonts ?? []);
        if (cancelled) return;
        await canvas.loadFromJSON(validateCanvasJSON(current.canvas, window.location.origin));
        if (!cancelled) setImage(canvas.toDataURL({ format: "png", multiplier: 1 }));
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "Unable to show this slide."); }
      finally { await canvas.dispose(); }
    })();
    return () => { cancelled = true; };
  }, [current, project.fonts, size.width, size.height]);
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      // Capture before the editor's keyboard shortcuts; presentation cannot change a design.
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
      if ((e.target as HTMLElement)?.closest("input,select,textarea,button")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); setPage(p => Math.min(project.pages.length - 1, p + 1)); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setPage(p => Math.max(0, p - 1)); }
      if (e.key === "+" || e.key === "=") { e.preventDefault(); setZoom(z => Math.min(3, z + .25)); }
      if (e.key === "-") { e.preventDefault(); setZoom(z => Math.max(.5, z - .25)); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); setMarks(m => ({ ...m, [current.id]: (m[current.id] ?? []).slice(0, -1) })); }
    };
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
  }, [current.id, project.pages.length, onExit]);
  const point = (e: React.PointerEvent<SVGSVGElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(size.width, (e.clientX - rect.left) * size.width / rect.width)), Math.max(0, Math.min(size.height, (e.clientY - rect.top) * size.height / rect.height))];
  };
  const add = (mark: Mark) => setMarks(m => ({ ...m, [current.id]: [...(m[current.id] ?? []), mark] }));
  const renderMark = (mark: Mark, key: number) => {
    const [start, end] = [mark.points[0], mark.points.at(-1)!];
    const common = { stroke: mark.color, strokeWidth: mark.width, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    if (mark.tool === "note") return <text key={key} x={start[0]} y={start[1]} fill={mark.color} fontSize={Math.max(24, size.width / 35)} fontFamily="Arial" dominantBaseline="hanging">{mark.text}</text>;
    if (mark.tool === "pen") return <polyline key={key} points={mark.points.map(p => p.join(",")).join(" ")} {...common} />;
    if (mark.tool === "line") return <line key={key} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} {...common} />;
    const x = Math.min(start[0], end[0]), y = Math.min(start[1], end[1]), w = Math.abs(end[0] - start[0]), h = Math.abs(end[1] - start[1]);
    if (mark.tool === "box") return <rect key={key} x={x} y={y} width={w} height={h} {...common} />;
    return <ellipse key={key} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...common} />;
  };
  return <section className={styles.presentation} role="dialog" aria-modal="true" aria-label="Presentation" tabIndex={-1} ref={element => { if (element && !element.contains(document.activeElement)) element.focus(); }}>
    <div className={styles.viewport} ref={area}>
      <div className={styles.center} style={{ minWidth: size.width * scale + 40, minHeight: size.height * scale + 40 }}>
        <div className={styles.slide} style={{ width: size.width * scale, height: size.height * scale }}>
          {image ? <img src={image} alt={`Slide ${page + 1}: ${current.name}`} draggable={false} /> : <p role="status">{error || "Loading slide…"}</p>}
          {image && <svg viewBox={`0 0 ${size.width} ${size.height}`} className={tool === "pointer" ? styles.pointer : styles.draw} aria-label="Presentation annotations"
            onPointerDown={e => { if (tool === "pointer" || e.button !== 0) return; e.preventDefault(); const p = point(e); if (tool === "note") { if (note.trim()) add({ tool, points: [p], text: note.trim(), color, width }); return; } e.currentTarget.setPointerCapture(e.pointerId); drawing.current = { tool, color, width, points: [p, p] }; setDraft(drawing.current); }}
            onPointerMove={e => { const mark = drawing.current; if (!mark) return; const p = point(e); const next = { ...mark, points: mark.tool === "pen" ? [...mark.points, p] : [mark.points[0], p] }; drawing.current = next; setDraft(next); }}
            onPointerUp={e => { if (!drawing.current) return; add(drawing.current); drawing.current = null; setDraft(null); if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
            onPointerCancel={() => { drawing.current = null; setDraft(null); }}>
            {(marks[current.id] ?? []).map(renderMark)}{draft && renderMark(draft, -1)}
          </svg>}
        </div>
      </div>
    </div>
    <div className={styles.controls}>
      <div><button aria-label="Previous slide" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button><span>{page + 1} / {project.pages.length}</span><button aria-label="Next slide" disabled={page === project.pages.length - 1} onClick={() => setPage(p => p + 1)}>→</button></div>
      <div><button aria-label="Presentation zoom out" disabled={zoom <= .5} onClick={() => setZoom(z => Math.max(.5, z - .25))}>−</button><button aria-label="Fit presentation to screen" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}% · Fit</button><button aria-label="Presentation zoom in" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + .25))}>+</button></div>
      <div>{(["pointer", "pen", "line", "box", "circle", "note"] as Tool[]).map(t => <button key={t} aria-pressed={tool === t} onClick={() => { drawing.current = null; setDraft(null); setTool(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>)}</div>
      <div><input type="color" aria-label="Annotation color" value={color} onChange={e => setColor(e.target.value)} /><select aria-label="Annotation stroke width" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={3}>Thin</option><option value={5}>Medium</option><option value={10}>Thick</option></select></div>
      {tool === "note" && <input aria-label="Note text" placeholder="Type a note, then click the slide" value={note} maxLength={160} onChange={e => setNote(e.target.value)} />}
      <div><button disabled={!marks[current.id]?.length} onClick={() => setMarks(m => ({ ...m, [current.id]: (m[current.id] ?? []).slice(0, -1) }))}>Undo drawing</button><button disabled={!marks[current.id]?.length} onClick={() => setMarks(m => ({ ...m, [current.id]: [] }))}>Clear slide</button><button onClick={onExit}>Exit presentation</button></div>
      <small>Drawings are temporary and clear when you exit. Scroll to explore a zoomed slide.</small>
    </div>
  </section>;
}

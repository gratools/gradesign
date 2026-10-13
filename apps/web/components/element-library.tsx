"use client";
import { useEffect, useRef, useState } from "react";
import { emojiImage } from "../lib/svg-elements";
import styles from "./element-library.module.css";

type Emoji = { emoji: string; label: string; tags: string[]; flag?: string };
const base = `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/elements`;
const iconPreview = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
export default function ElementLibrary({ onSVG, onEmoji }: {
  onSVG: (svg: string, name: string) => Promise<void>;
  onEmoji: (src: string, name: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"icons" | "emoji">("icons");
  const [query, setQuery] = useState("");
  const [iconData, setIconData] = useState<Record<string, string>>({});
  const [icons, setIcons] = useState<string[]>([]);
  const [emoji, setEmoji] = useState<Emoji[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [limit, setLimit] = useState(80);
  const alive = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; pending.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    const url = tab === "icons" ? `${base}/lucide.json` : `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/elements/emoji.json`;
    fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Library unavailable. Please try again.");
      const data = await response.json();
      if (tab === "emoji") setEmoji(data);
      else {
        setIconData(data);
        const names = Object.keys(data);
        setIcons([...new Set(names)].filter(name => /^[a-z0-9-]+$/.test(name)).sort());
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [tab, retry]);
  const search = query.toLowerCase().trim();
  const matches = tab === "icons" ? icons.filter(name => name.replaceAll("-", " ").includes(search)) : emoji.filter(item => `${item.label} ${item.tags.join(" ")} ${item.emoji}`.toLowerCase().includes(search));
  async function insert(item: string | Emoji) {
    if (busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); pending.current = controller;
    try {
      if (typeof item === "string") {
        const svg = iconData[item];
        if (!svg) throw new Error("Please reload the icon library.");
        if (alive.current) await onSVG(svg, `Icon: ${item.replaceAll("-", " ")}`);
      } else {
        let src: string;
        if (item.flag) {
          const response = await fetch(base + '/flags/' + item.flag + '.png', {signal: controller.signal});
          if (!response.ok) throw new Error('Could not load this flag. Please try again.');
          const blob = await response.blob();
          src = await new Promise<string>((resolve, reject) => {const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(new Error('Could not read flag.')); reader.readAsDataURL(blob);});
        } else src = emojiImage(item.emoji);
        if (alive.current) await onEmoji(src, 'Emoji: ' + item.label);
      }
    } catch (cause) { if (alive.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not add element."); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className={styles.library} aria-label="Element library">
    <div className={styles.tabs}>{(["icons", "emoji"] as const).map(value => <button key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setQuery(""); setLimit(80); }}>{value === "icons" ? "SVG icons" : "Emoji"}</button>)}</div>
    <input aria-label="Search elements" placeholder={tab === "icons" ? "Search icons…" : "Search emoji…"} value={query} onChange={event => { setQuery(event.target.value); setLimit(80); }} />
    {loading ? <p role="status">Loading library…</p> : <p className={styles.caption}>{matches.length.toLocaleString()} {tab === "icons" ? "icons · Lucide" : "emoji"}{busy ? " · Adding…" : ""}</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRetry(value => value + 1)}>Retry library</button></div>}
    <div className={styles.grid}>{matches.slice(0, limit).map(item => {
      const label = typeof item === "string" ? item.replaceAll("-", " ") : item.label;
      return <button key={typeof item === "string" ? item : item.emoji} aria-label={`Add ${label}`} title={label} disabled={busy} onClick={() => void insert(item)}>{typeof item === "string" ? <img src={iconPreview(iconData[item])} alt="" width={28} height={28} loading="lazy" /> : item.flag ? <img src={`${base}/flags/${item.flag}.png`} alt="" width={32} height={24} loading="lazy" /> : <span>{item.emoji}</span>}</button>;
    })}</div>
    {!loading && !error && !matches.length && <p>No matches. Try another word.</p>}
    {matches.length > limit && <button className={styles.more} onClick={() => setLimit(value => value + 80)}>Show more</button>}
    <p className={styles.caption}>{tab === "icons" ? <>Free icons by <a href="https://lucide.dev/license" target="_blank" rel="noreferrer">Lucide</a>, bundled with the studio. Select an icon to change its color.</> : "Emoji are added as images to preserve their appearance in your design."}</p>
  </section>;
}

"use client";
import { useEffect, useRef, useState } from "react";
import { generateQR, type QRSettings } from "../lib/qr-code";
import styles from "./qr-maker.module.css";
export default function QRMaker({ onAdd }: { onAdd: (src: string, name: string) => Promise<void> }) {
  const [settings, setSettings] = useState<QRSettings>({ text: "", foreground: "#12261f", background: "#ffffff", correction: "M" });
  const [result, setResult] = useState({ key: "", src: "", error: "" });
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const key = JSON.stringify(settings);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      generateQR(settings).then(src => { if (current) setResult({key, src, error: ""}); })
        .catch(cause => { if (current) setResult({key, src: "", error: cause instanceof Error ? cause.message : "Could not generate this code."}); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [key, settings]);
  const ready = result.key === key && !!result.src;
  return <details className={styles.maker}>
    <summary>Custom QR code</summary>
    <p>Create a code for a link, contact details, or any text.</p>
    <label>Link or text<textarea aria-label="QR code content" placeholder="https://example.com" maxLength={1200} value={settings.text} onChange={e => { setSettings({...settings,text:e.target.value}); setMessage(""); }} /></label>
    <div className={styles.colors}>
      <label>Code color<input aria-label="QR code color" type="color" value={settings.foreground} onChange={e => setSettings({...settings,foreground:e.target.value})} /></label>
      <label>Background<input aria-label="QR background color" type="color" value={settings.background} onChange={e => setSettings({...settings,background:e.target.value})} /></label>
    </div>
    <label>Error correction<select aria-label="QR error correction" value={settings.correction} onChange={e => setSettings({...settings,correction:e.target.value as QRSettings["correction"]})}><option value="M">Standard</option><option value="Q">High</option><option value="H">Highest</option></select></label>
    {ready && <img className={styles.preview} src={result.src} alt="QR code preview" />}
    {settings.text && result.key === key && result.error && <p role="alert">{result.error}</p>}
    <button disabled={!ready || adding} onClick={async () => {
      setAdding(true); setMessage("");
      try { await onAdd(result.src, "QR code"); if (mounted.current) setMessage("QR code added to your design."); }
      catch { if (mounted.current) setMessage("Could not add the code. Please try again."); }
      finally { if (mounted.current) setAdding(false); }
    }}>{adding ? "Adding…" : "Add QR code"}</button>
    {message && <p role="status">{message}</p>}
    <p>Generated on your device. Keep the surrounding space clear and test your final design with a camera.</p>
  </details>;
}

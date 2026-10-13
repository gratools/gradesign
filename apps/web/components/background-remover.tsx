"use client";
import { useEffect, useRef, useState } from "react";
import { removeBackground } from "../lib/background-removal";
import { editAlpha } from "../lib/cutout";
export default function BackgroundRemover({ apply }: { apply: (process: (src: string) => Promise<string>) => Promise<void> }) {
  const controller = useRef<AbortController | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [solidity,setSolidity]=useState(70);
  const [keyColor,setKeyColor]=useState('#00ff00');
  const [tolerance,setTolerance]=useState(80);
  const [softness,setSoftness]=useState(40);
  const [spill,setSpill]=useState(50);
  async function adjust(mode: 'key'|'solid') {
    const own = new AbortController(); controller.current = own;
    setBusy(true);setStatus('Applying settings…');
    try {await apply(async src=>{const result=await editAlpha(src,mode==='key'?{color:keyColor,tolerance,softness,spill}:solidity);if(own.signal.aborted) throw new Error('Cancelled');return result;});if(!own.signal.aborted)setStatus('Applied. Undo before trying different settings.');}
    catch(error){if(!own.signal.aborted)setStatus(error instanceof Error?error.message:'Could not process image.');}
    finally{if(!own.signal.aborted)setBusy(false);}
  }
  useEffect(() => () => controller.current?.abort(), []);
  return <div className="cutout-controls" style={{margin:"12px 0"}}>
    <label className="micro-copy">Subject solidity: {solidity}%<input aria-label="Subject solidity" type="range" min="0" max="100" value={solidity} onChange={e=>setSolidity(Number(e.target.value))}/></label>
    <button className="button button-secondary" disabled={busy} onClick={async () => {
      const own = new AbortController(); controller.current = own; setBusy(true); setStatus("Preparing image…");
      try { await apply(src => removeBackground(src, own.signal, setStatus, solidity)); if (!own.signal.aborted) setStatus("Background removed. Use Undo to restore it."); }
      catch (error) { if (!own.signal.aborted) setStatus(error instanceof Error ? error.message : "Could not remove background."); }
      finally { if (!own.signal.aborted) setBusy(false); }
    }}>Remove background</button>
    {busy && <button className="button button-secondary" onClick={() => {controller.current?.abort();setBusy(false);setStatus("Cancelled. Your image is unchanged.");}}>Cancel</button>}
    {status && <p className="micro-copy" role="status">{status}</p>}
    <p className="micro-copy">Free · Runs on your device. First use loads about 16 MB. Best with a clear subject.</p>
    <button className="button button-secondary" disabled={busy} onClick={()=>void adjust('solid')}>Solidify existing cutout</button>
    <details style={{marginTop:12}}><summary>Chroma key</summary>
      <label className="micro-copy">Remove color<input aria-label="Chroma key color" type="color" value={keyColor} onChange={e=>setKeyColor(e.target.value)}/></label>
      <label className="micro-copy">Tolerance: {tolerance}<input aria-label="Chroma tolerance" type="range" min="0" max="440" value={tolerance} onChange={e=>setTolerance(Number(e.target.value))}/></label>
      <label className="micro-copy">Edge softness: {softness}<input aria-label="Chroma softness" type="range" min="1" max="200" value={softness} onChange={e=>setSoftness(Number(e.target.value))}/></label>
      <label className="micro-copy">Spill reduction: {spill}%<input aria-label="Chroma spill reduction" type="range" min="0" max="100" value={spill} onChange={e=>setSpill(Number(e.target.value))}/></label>
      <button className="button button-secondary" disabled={busy} onClick={()=>void adjust('key')}>Apply chroma key</button>
      <p className="micro-copy">Choose the background color. Undo before reapplying settings; edits are cumulative.</p>
    </details>
  </div>;
}

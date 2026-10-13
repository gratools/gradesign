export async function removeBackground(src: string, signal: AbortSignal, progress: (message: string) => void, solidity = 70): Promise<string> {
  const image = new Image(); image.src = src; await image.decode();
  if (signal.aborted) throw new Error("Cancelled");
  if (image.naturalWidth * image.naturalHeight > 16_000_000) throw new Error("Use an image under 16 megapixels for background removal.");
  const small = document.createElement("canvas"); small.width = small.height = 320;
  const ctx = small.getContext("2d")!;
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 320, 320); ctx.drawImage(image, 0, 0, 320, 320);
  const pixels = ctx.getImageData(0, 0, 320, 320).data;
  const input = new Float32Array(3 * 320 * 320);
  let max = 1; for (let i = 0; i < pixels.length; i += 4) max = Math.max(max, pixels[i], pixels[i + 1], pixels[i + 2]);
  const mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < 320 * 320; i++) for (let c = 0; c < 3; c++) input[c * 320 * 320 + i] = (pixels[i * 4 + c] / max - mean[c]) / std[c];
  const mask = await new Promise<Float32Array>((resolve, reject) => {
    const worker = new Worker(`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/background-removal/worker.js`);
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); worker.terminate(); };
    const abort = () => { finish(); reject(new Error("Cancelled")); };
    const timer = setTimeout(() => { finish(); reject(new Error("Processing took too long. Try a smaller image.")); }, 180_000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.status) progress(data.status);
      if (data.error) { finish(); reject(new Error(data.error)); }
      if (data.mask) { finish(); resolve(data.mask); }
    };
    worker.onerror = () => { finish(); reject(new Error("Could not load the background remover. Refresh and try again.")); };
    worker.postMessage(input, [input.buffer]);
  });
  if (signal.aborted) throw new Error("Cancelled");
  let min = Infinity, maxMask = -Infinity;
  for (const value of mask) { min = Math.min(min, value); maxMask = Math.max(maxMask, value); }
  if (!Number.isFinite(min) || maxMask - min < 1e-6) throw new Error("Could not identify a foreground subject in this image.");
  const alpha = ctx.createImageData(320, 320);
  for (let i = 0; i < mask.length; i++) { alpha.data[i*4] = alpha.data[i*4+1] = alpha.data[i*4+2] = 255; alpha.data[i*4+3] = Math.round(255 * Math.max(0, Math.min(1, ((mask[i]-min)/(maxMask-min) - .03) / Math.max(.1, 1 - solidity / 100 * .75)))); }
  ctx.putImageData(alpha, 0, 0);
  const result = document.createElement("canvas"); result.width = image.naturalWidth; result.height = image.naturalHeight;
  const output = result.getContext("2d")!;
  output.drawImage(image, 0, 0); output.globalCompositeOperation = "destination-in";
  output.drawImage(small, 0, 0, result.width, result.height);
  return result.toDataURL("image/png");
}

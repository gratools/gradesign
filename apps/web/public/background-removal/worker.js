/* U2Net inference stays in this worker; no image data is sent to a server. */
importScripts('./ort.wasm.min.js');
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL('./', self.location.href).href;
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ status: 'Loading background remover…' });
    const session = await ort.InferenceSession.create(new URL('./u2netp.onnx', self.location.href).href, { executionProviders: ['wasm'] });
    self.postMessage({ status: 'Removing background…' });
    const input = new ort.Tensor('float32', data, [1, 3, 320, 320]);
    const output = await session.run({ [session.inputNames[0]]: input });
    const mask = new Float32Array(output[session.outputNames[0]].data);
    self.postMessage({ mask }, [mask.buffer]);
    input.dispose(); Object.values(output).forEach(t => t.dispose());
    await session.release();
  } catch (error) { self.postMessage({ error: 'Background removal could not finish. Please retry with a smaller image or another browser.' }); }
};

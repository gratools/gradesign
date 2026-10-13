/**
 * Integration checks for the actual React/Fabric editor, plus scene validation.
 * Run: node scripts/test-canvas.cjs
 * Requires Fabric's optional node-canvas binary. A compatible @napi-rs/canvas
 * installation can be supplied with GRADESIGN_NATIVE_CANVAS=/path/to/package.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const repository = path.resolve(__dirname, "..");
const requireWeb = Module.createRequire(path.join(repository, "apps/web/package.json"));
if (process.env.GRADESIGN_NATIVE_CANVAS) {
  const nativeCanvas = require(process.env.GRADESIGN_NATIVE_CANVAS);
  const originalLoad = Module._load;
  Module._load = function (name, ...args) {
    return name === "canvas" ? nativeCanvas : originalLoad.call(this, name, ...args);
  };
}
const fabric = requireWeb("fabric/node");
const browserEnv = fabric.getEnv();
global.document = browserEnv.document;
global.window = browserEnv.window;
global.HTMLElement = browserEnv.window.HTMLElement;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = requireWeb("react");
const { createRoot } = requireWeb("react-dom/client");
const ts = requireWeb("typescript");
const moduleCache = new Map();
let canvas;

// Compile the real TS source without generating build files or copying its logic.
function load(relativeFile) {
  const file = path.resolve(repository, relativeFile);
  if (moduleCache.has(file)) return moduleCache.get(file);
  const module = { exports: {} };
  moduleCache.set(file, module.exports);
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  new Function("require", "module", "exports", source)((name) => {
    if (name === "fabric") return {
      ...fabric,
      Canvas: class extends fabric.Canvas {
        constructor(...args) { super(...args); canvas = this; }
      },
    };
    return name.startsWith(".")
      ? load(path.resolve(path.dirname(file), `${name}.ts`))
      : requireWeb(name);
  }, module, module.exports);
  return module.exports;
}

const { getCanvasSize, resizeCanvasJSON, PRESENTATION_SIZES } = load("apps/web/lib/document-size.ts");
const { validateCanvasJSON } = load("apps/web/lib/canvas-types.ts");
const { createTemplate } = load("apps/web/lib/templates.ts");
const {keyPixels,dilateAlpha}=load('apps/web/lib/cutout.ts');
const keyed=new Uint8ClampedArray([0,255,0,255,255,0,0,255,0,155,0,200]);
keyPixels(keyed,{color:'#00ff00',tolerance:80,softness:40,spill:0});
assert.deepEqual([...keyed],[0,255,0,0,255,0,0,255,0,155,0,100]);
const seed=new Uint8ClampedArray(25);seed[12]=255;
const dilated=dilateAlpha(seed,5,5,1);
assert.equal([...dilated].filter(x=>x===255).length,9);
assert.equal(dilated[0],0);assert.equal(dilated[6],255);
assert.deepEqual(dilateAlpha(seed,5,5,0),seed);
const {libraryTemplates,libraryScene}=load('apps/web/lib/template-library.ts');
assert.equal(libraryTemplates.length,90);
for(const template of libraryTemplates){validateCanvasJSON(libraryScene(template.id));assert(fs.existsSync(path.join(repository,'apps/web/public/templates',template.id+'.png')));}
console.log('PASS: chroma transparency/softness, alpha dilation, and 90 template scenes/previews.');
const origin = "https://gradesign.test";
const { safeIconSVG } = load('apps/web/lib/svg-elements.ts');
const catalog = JSON.parse(fs.readFileSync(path.join(repository, 'apps/web/public/elements/lucide.json')));
for (const svg of Object.values(catalog)) assert(safeIconSVG(svg));
const emojiCatalog = JSON.parse(fs.readFileSync(path.join(repository, 'apps/web/public/elements/emoji.json')));
assert.equal(emojiCatalog.find(e => e.emoji === '🇺🇸').flag, 'us');
for (const item of emojiCatalog.filter(e => e.flag)) {
  const bytes = fs.readFileSync(path.join(repository, 'apps/web/public/elements/flags', item.flag + '.png'));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
}
console.log('PASS: all ' + Object.keys(catalog).length + ' bundled SVGs validated; every flag resolves to a PNG.');

assert.deepEqual(getCanvasSize({ objects: [] }), { width: 960, height: 640 });
for (const size of PRESENTATION_SIZES) {
  const scene = createTemplate("studio", size.width, size.height);
  assert.deepEqual(getCanvasSize(scene), { width: size.width, height: size.height });
  assert.deepEqual(getCanvasSize(validateCanvasJSON(scene, origin)), getCanvasSize(scene));
  const ratio = Math.min(size.width / 960, size.height / 640);
  assert.equal(scene.objects[0].scaleX, ratio);
  assert.equal(scene.objects[0].left, 58 * ratio + (size.width - 960 * ratio) / 2);
}
for (const dims of [[0, 1080], [3841, 1080], [1920, 179], [1920, 1080.1], [NaN, 1080], [undefined, 1080]]) {
  assert.throws(() => resizeCanvasJSON({ objects: [] }, ...dims));
  assert.throws(() => validateCanvasJSON({ objects: [], width: dims[0], height: dims[1] }, origin));
}
const original = { objects: [{ type: "Group", left: 20, top: 40, scaleX: 2, scaleY: 3, angle: 30, objects: [{ left: 1, top: 2 }] }] };
let repeated = original;
for(let i=0;i<5;i++) { repeated=resizeCanvasJSON(repeated,1080,1920); repeated=resizeCanvasJSON(repeated,1920,1080); }
assert.deepEqual(repeated.objects,original.objects,'repeated default resizing must preserve artwork size and position');
const resized = resizeCanvasJSON(original, 1920, 1080, true);
assert.equal(original.objects[0].left, 20);
assert.equal(resized.objects[0].scaleX, 3.375);
assert.equal(resized.objects[0].angle, 30);
assert.equal(resized.objects[0].objects[0].left, 1);
assert.deepEqual(resizeCanvasJSON(original, 1080, 1920, false).objects, original.objects);
assert.throws(() => validateCanvasJSON(JSON.parse('{"objects":[{"__proto__":{"polluted":true}}]}'), origin));
assert.throws(() => validateCanvasJSON({ objects: [{ type: "Image", src: "https://other.test/tracker.png" }] }, origin));
assert.throws(() => validateCanvasJSON({ objects: [{ type: "Image", src: "data:image/svg+xml;base64,PHN2Zz4=" }] }, origin));
assert.equal(validateCanvasJSON({ objects: [], width: 1920, height: 1080, skipTargetFind: true }, origin).skipTargetFind, undefined);

const DesignCanvas = load("apps/web/components/design-canvas.tsx").default;
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
const ref = React.createRef();
const pause = () => new Promise((resolve) => setTimeout(resolve, 30));
let selection;

async function run() {
  await React.act(async () => {
    root.render(React.createElement(DesignCanvas, {
      ref, zoom: 0.5, grid: false,
      initialJSON: { width: 960, height: 640, objects: [{ type: "Textbox", id: "text", text: "Hello world", left: 40, top: 50, width: 500, fontFamily: "Arial", fontSize: 40, fontWeight: 400 }] },
      onChange: () => {}, onHistoryChange: () => {}, onSelection: (next) => { selection = next; },
    }));
    await pause();
  });
  assert.equal(canvas.width, 960);
  let text = canvas.getObjects()[0];
  await React.act(async () => {
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectionStart = 6;
    text.selectionEnd = 11;
    text._fireSelectionChanged();
    text._updateTextarea();
    ref.current.captureTextSelection();
    ref.current.updateSelection({ fontWeight: 700 });
    await pause();
  });
  assert.equal(text.getSelectionStyles(0, 1, true)[0].fontWeight, 400);
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontWeight, 700);
  assert.deepEqual(selection.textSelection, { start: 6, end: 11 });
  const editingScene = ref.current.getJSON();
  assert.equal(editingScene.objects[0].lockMovementX, false);
  assert.equal(editingScene.objects[0].selectable, true);

  // The toolbar captures on pointerdown, then a numeric input takes browser focus.
  const fontInput = document.createElement("input");
  document.body.append(fontInput);
  await React.act(async () => {
    ref.current.captureTextSelection();
    fontInput.focus();
    ref.current.updateSelection({ fontSize: 64 });
    await pause();
  });
  assert.equal(document.activeElement, fontInput);
  assert.equal(text.getSelectionStyles(0, 1, true)[0].fontSize, 40);
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontSize, 64);
  await React.act(async () => {
    ref.current.captureTextSelection();
    text.exitEditing();
    ref.current.updateSelection({ fontStyle: "italic", fill: "#304bff", fontFamily: "Georgia" });
    await pause();
  });
  assert.equal(text.getSelectionStyles(0, 1, true)[0].fontFamily, "Arial");
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontFamily, "Georgia");
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontStyle, "italic");
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fill, "#304bff");
  assert.equal(selection.fontSize, 64);
  const richScene = ref.current.getJSON();

  await React.act(async () => {
    text.enterEditing();
    ref.current.toggleLayer("text", "locked");
    await pause();
  });
  const lockedScene = ref.current.getJSON();
  assert.equal(text.isEditing, false);
  assert.equal(lockedScene.objects[0].lockMovementX, true);
  assert.equal(lockedScene.objects[0].lockMovementY, true);
  assert.equal(lockedScene.objects[0].selectable, false);
  assert.equal(lockedScene.objects[0].editable, false);
  await React.act(async () => { ref.current.undo(); await pause(); });
  text = canvas.getObjects()[0];
  assert.equal(text.lockMovementX, false);
  assert.equal(text.editable, true);

  await React.act(async () => { ref.current.undo(); await pause(); });
  text = canvas.getObjects()[0];
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontStyle, "normal");
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontSize, 64);
  assert.equal(text.selectable, true);
  assert.equal(text.lockMovementX, false);
  await React.act(async () => { ref.current.redo(); await pause(); });
  text = canvas.getObjects()[0];
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontFamily, "Georgia");

  await React.act(async () => {
    canvas.setActiveObject(text);
    canvas.fire("mouse:down:before", {});
    canvas.fire("mouse:up", {});
    ref.current.updateSelection({ fontWeight: 400, fontSize: 32 });
    await pause();
  });
  for (const style of text.getSelectionStyles(0, 11, true)) {
    assert.equal(style.fontWeight, 400);
    assert.equal(style.fontSize, 32);
  }
  assert.equal(text.getSelectionStyles(6, 7, true)[0].fontStyle, "italic");
  assert(selection.mixed.includes("fontFamily"));
  assert.equal(selection.textSelection, undefined);

  const before = ref.current.getJSON();
  await React.act(async () => { await ref.current.resize(1080, 1920); await pause(); });
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1920);
  assert.equal(ref.current.getJSON().objects[0].scaleX, before.objects[0].scaleX);
  assert.equal(ref.current.getJSON().objects[0].top, before.objects[0].top);
  await React.act(async () => { ref.current.undo(); await pause(); });
  assert.equal(canvas.width, 960);
  assert.equal(canvas.height, 640);
  assert.deepEqual(ref.current.getJSON(), before);
  await React.act(async () => { ref.current.redo(); await pause(); });
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1920);
  assert.match(ref.current.export("svg"), /width="1080" height="1920"/);
  await React.act(async () => { await ref.current.applyTemplate("blank"); await pause(); });
  assert.equal(canvas.width, 1080);
  assert.equal(canvas.height, 1920);

  await React.act(async () => {
    await ref.current.addSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2 L22 22" fill="none" stroke="currentColor" stroke-width="2"/></svg>', 'Icon: test');
    ref.current.updateSelection({fill:'#304bff'});
    await pause();
  });
  assert.equal(canvas.getActiveObject().getObjects()[0].stroke, '#304bff');
  const iconScene = ref.current.getJSON();
  await React.act(async () => { await ref.current.load(iconScene); await pause(); });
  assert.equal(canvas.getObjects()[0].assetType, 'icon');
  assert.equal(canvas.getObjects()[0].getObjects()[0].stroke, '#304bff');
  await assert.rejects(ref.current.addSVG('<svg><image href="https://example.com/x"/></svg>', 'unsafe'));
  await assert.rejects(ref.current.addSVG('<svg><script>alert(1)</script></svg>', 'unsafe'));
  assert.match(ref.current.export('svg'), /48,75,255/);
  await React.act(async () => { await ref.current.applyTemplate('blank'); await pause(); });
  await React.act(async () => {
    ref.current.addShape('line'); ref.current.updateSelection({fill:'#ff0000'}); await pause();
  });
  assert.equal(canvas.getActiveObject().stroke, '#ff0000');
  assert.equal(canvas.getActiveObject().strokeWidth, 12);
  for (const kind of ['rectangle', 'triangle', 'star']) {
    await React.act(async () => {ref.current.addShape(kind); ref.current.updateSelection({cornerRadius:20,stroke:'#123456',strokeWidth:8}); await pause();});
    assert.equal(canvas.getActiveObject().stroke, '#123456');
    assert.equal(selection.cornerRadius,20);
    const rounded = ref.current.getJSON();
    await React.act(async () => {await ref.current.load(rounded); await pause();});
    const last = canvas.getObjects().at(-1);
    assert.equal(last.strokeWidth,8);
    assert(kind === 'rectangle' ? last.rx === 20 : last.cornerPoints.length > 0);
  }
  await React.act(async () => {await ref.current.applyTemplate('blank'); await pause();});
  // Grouping, saving and reloading preserve individual character styles too.
  const backdrop = fabric.util.createCanvasElement();
  backdrop.width = 20; backdrop.height = 10;
  backdrop.getContext("2d").fillRect(0, 0, 20, 10);
  await React.act(async () => {await ref.current.addImage(backdrop.toDataURL()); ref.current.updateSelection({cornerRadius:3,stroke:'#ff0000',strokeWidth:2}); await pause();});
  const frame = canvas.getActiveObject();
  assert.equal(frame.assetType,'image-frame');
  assert.equal(frame.getObjects()[0].clipPath.rx,3);
  assert.equal(frame.getObjects()[1].stroke,'#ff0000');
  assert.equal(frame.getObjects()[1].width,18);
  const aligned = (frame) => {
    const [image, border] = frame.getObjects();
    image.setCoords(); border.setCoords();
    image.getCoords().forEach((point, index) => {
      assert(Math.abs(point.x - border.getCoords()[index].x) < 0.001, 'border x aligns with image');
      assert(Math.abs(point.y - border.getCoords()[index].y) < 0.001, 'border y aligns with image');
    });
  };
  aligned(frame);
  frame.set({scaleX: 2.4, scaleY: 1.7, angle: 37}); frame.setCoords();
  aligned(frame);
  await React.act(async () => {ref.current.updateSelection({strokeWidth:4,cornerRadius:4}); await pause();});
  aligned(frame);
  // Simulate a saved frame from the old offset implementation.
  frame.getObjects()[1].set({originX:'left',originY:'top',left:frame.getObjects()[0].left+2,top:frame.getObjects()[0].top+2});
  const framedScene=ref.current.getJSON();
  await React.act(async () => {await ref.current.load(framedScene); await pause();});
  assert.equal(canvas.getObjects()[0].getObjects()[0].clipPath.rx,4);
  aligned(canvas.getObjects()[0]);
  const beforeRemoval = ref.current.getJSON();
  const processed = fabric.util.createCanvasElement(); processed.width=20;processed.height=10;
  processed.getContext('2d').fillRect(5,2,10,6);
  await React.act(async () => {
    canvas.setActiveObject(canvas.getObjects()[0]);
    await ref.current.removeImageBackground(async () => processed.toDataURL()); await pause();
  });
  assert.equal(canvas.getObjects()[0].getObjects()[0].getSrc(),processed.toDataURL());
  assert.equal(canvas.getObjects()[0].getObjects()[0].clipPath,undefined);
  assert.equal(canvas.getObjects()[0].cutout,true);
  const ring = canvas.getObjects()[0].getObjects()[1].fill.source.getContext('2d').getImageData(0,0,20,10).data;
  assert.equal(ring[(5*20+10)*4+3],0,'outline leaves opaque subject interior unchanged');
  assert(canvas.getObjects()[0].getObjects()[1].fill instanceof fabric.Pattern);
  assert.equal(ring[(5*20)*4+3],0,'outline does not draw a rectangular frame');
  aligned(canvas.getObjects()[0]);
  await React.act(async () => {ref.current.undo();await pause();});
  assert.deepEqual(ref.current.getJSON(),beforeRemoval);
  let releaseMask; const deferred = new Promise(resolve=>{releaseMask=resolve});
  canvas.setActiveObject(canvas.getObjects()[0]);
  const staleRemoval = ref.current.removeImageBackground(()=>deferred);
  await React.act(async () => {await ref.current.load(beforeRemoval);await pause();});
  releaseMask(processed.toDataURL());
  await assert.rejects(staleRemoval,/changed while processing/);
  assert.deepEqual(ref.current.getJSON(),beforeRemoval);
  assert.match(ref.current.export('svg'), /clipPath/);
  await React.act(async () => {await ref.current.applyTemplate('blank'); await ref.current.setBackgroundImage(backdrop.toDataURL()); await pause();});
  assert.equal(canvas.getObjects().length, 0, "background is not an editable layer");
  assert.equal(canvas.backgroundImage.getScaledHeight(), 1920);
  assert.equal(canvas.backgroundImage.selectable, false);
  const backgroundScene = ref.current.getJSON();
  assert(backgroundScene.backgroundImage.src.startsWith("data:image/png"));
  await React.act(async () => { await ref.current.setBackgroundImage(null); await pause(); });
  assert.equal(canvas.backgroundImage, undefined);
  await React.act(async () => { ref.current.undo(); await pause(); });
  assert(canvas.backgroundImage, "undo restores the background");
  await React.act(async () => { await ref.current.load(backgroundScene); await pause(); });
  assert.equal(canvas.backgroundImage.getScaledHeight(), 1920, "background survives reload");
  assert.match(ref.current.export("svg"), /data:image\/png/);

  await React.act(async () => {
    await ref.current.load(richScene);
    ref.current.addShape("circle");
    canvas.discardActiveObject();
    canvas.setActiveObject(new fabric.ActiveSelection(canvas.getObjects(), { canvas }));
    ref.current.group();
    await pause();
  });
  assert.equal(canvas.getObjects().length, 1);
  const grouped = ref.current.getJSON();
  await React.act(async () => { await ref.current.load(grouped); ref.current.refreshFonts(); await pause(); });
  const child = canvas.getObjects()[0].getObjects().find((object) => object instanceof fabric.IText);
  assert.equal(child.getSelectionStyles(0, 1, true)[0].fontWeight, 400);
  assert.equal(child.getSelectionStyles(6, 7, true)[0].fontWeight, 700);
  assert.equal(child.getSelectionStyles(6, 7, true)[0].fontFamily, "Georgia");
  await React.act(async () => {
    root.render(React.createElement(DesignCanvas, {
      ref, zoom: 0.05, grid: false,
      onChange: () => {}, onHistoryChange: () => {}, onSelection: (next) => { selection = next; },
    }));
    await pause();
  });
  const wrapper = container.querySelector(".design-canvas");
  assert.equal(wrapper.style.width, `${canvas.width * 0.05}px`);
  assert.equal(wrapper.style.height, `${canvas.height * 0.05}px`);
  assert.equal(wrapper.firstElementChild.style.transform, "scale(0.05)");
  await React.act(async () => { root.unmount(); await pause(); });
  console.log("PASS: dimensions/presets/contain scaling/validation; real React+Fabric selected styles and toolbar blur; editable snapshots; rich-style undo/redo; mixed reporting and whole-box override clearing; resize undo/redo and SVG dimensions; same-size templates; grouped rich-text save/load and font refresh; 5% display and wrapper zoom.");
}
run().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
  await React.act(async () => { root.unmount(); await pause(); });
});

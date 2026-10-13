"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  loadSVGFromString,
  ActiveSelection,
  cache,
  Canvas,
  Circle,
  FabricImage,
  FabricObject,
  Group,
  IText,
  Line,
  Point,
  Polygon,
  Rect,
  Textbox,
  Triangle,
} from "fabric";
import type {
  CanvasHandle,
  CanvasProps,
  DesignJSON,
  LayerInfo,
  SelectionInfo,
} from "../lib/canvas-types";
import { isSafeCanvasImage, validateCanvasJSON } from "../lib/canvas-types";
import { createTemplate, DESIGN_HEIGHT, DESIGN_WIDTH } from "../lib/templates";
import { getCanvasSize, resizeCanvasJSON } from "../lib/document-size";

import { borderObject, canRound, isImageFrame, roundElement, styleImageFrame, type StyledObject } from "../lib/element-style";
import { safeIconSVG } from "../lib/svg-elements";
type NamedObject = FabricObject & { id?: string; name?: string; assetType?: string };
const SERIALIZED_PROPERTIES = [
  "cutout",
  "outlineWidth",
  "outlineColor",
  "cornerRadius",
  "cornerPoints",
  "assetType",
  "id",
  "name",
  "lockMovementX",
  "lockMovementY",
  "lockScalingX",
  "lockScalingY",
  "lockRotation",
  "editable",
  "selectable",
];
FabricObject.customProperties = [
  ...new Set([...FabricObject.customProperties, ...SERIALIZED_PROPERTIES]),
];

function uid() {
  return crypto.randomUUID();
}
function isLocked(object: FabricObject) {
  // Fabric temporarily locks movement while editing text; that is not a layer lock.
  if (object instanceof IText && object.isEditing) return false;
  return object.lockMovementX && object.lockMovementY;
}
const CHARACTER_STYLES = [
  "fill", "stroke", "strokeWidth", "fontFamily", "fontSize", "fontWeight",
  "fontStyle", "underline",
] as const;
type TextRange = { start: number; end: number };

function describe(object: FabricObject, range?: TextRange): SelectionInfo {
  const value = object as NamedObject;
  const text = object instanceof IText ? object : undefined;
  const styles = text?.getSelectionStyles(
    range?.start ?? 0,
    range?.end ?? text.graphemeSplit(text.text).length,
    true,
  ) ?? [];
  const style = styles[0];
  const mixed = CHARACTER_STYLES.filter((key) =>
    styles.some((entry) => entry[key] !== style?.[key]),
  );
  return {
    id: value.id ?? "selection",
    type: object.type,
    stroke: typeof borderObject(object).stroke === "string" ? borderObject(object).stroke as string : "#252821",
    strokeWidth: borderObject(object).strokeWidth || 0,
    cornerRadius: (object as StyledObject).cornerRadius ?? (object instanceof Rect ? object.rx : 0),
    canRound: canRound(object),
    canRemoveBackground: object instanceof FabricImage || isImageFrame(object),
    canBorder: !(object instanceof IText) && (!(object instanceof Group) || isImageFrame(object)),
    fill: object instanceof Line && typeof object.stroke === "string" ? object.stroke : typeof style?.fill === "string" ? style.fill :
      typeof object.fill === "string" ? object.fill : "#252821",
    fontFamily: style?.fontFamily ?? text?.fontFamily,
    fontSize: style?.fontSize ?? text?.fontSize,
    fontWeight: style?.fontWeight ?? text?.fontWeight,
    fontStyle: style?.fontStyle ?? text?.fontStyle,
    underline: style?.underline ?? text?.underline,
    opacity: object.opacity,
    angle: object.angle,
    locked: isLocked(object),
    textSelection: range,
    mixed,
  };
}

function prepare(object: FabricObject, freshId = false) {
  const named = object as NamedObject;
  if (!named.id || freshId) named.id = uid();
  if (!named.name)
    named.name =
      object instanceof IText
        ? object.text.slice(0, 30) || "Text"
        : object.type;
  object.set({
    borderColor: "#304bff",
    cornerColor: "#ffffff",
    cornerStrokeColor: "#304bff",
    cornerStyle: "circle",
    transparentCorners: false,
    cornerSize: 10,
    padding: 3,
  });
  if (isLocked(object)) object.set({ selectable: false, editable: false });
  if (object instanceof Group)
    object.getObjects().forEach((child) => prepare(child, freshId));
  if (isImageFrame(object) && object instanceof Group && object.getObjects().length === 2) {
    const border = borderObject(object);
    styleImageFrame(object, (object as StyledObject).cornerRadius ?? 0, border.strokeWidth, border.stroke);
  }
  return object;
}

const DesignCanvas = forwardRef<CanvasHandle, CanvasProps>(
  function DesignCanvas(props, forwardedRef) {
    const host = useRef<HTMLDivElement>(null);
    const latest = useRef(props);
    latest.current = props;
    const api = useRef<CanvasHandle | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
    const [dimensions, setDimensions] = useState(() => {
      try { return getCanvasSize(props.initialJSON); }
      catch { return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT }; }
    });

    useImperativeHandle(
      forwardedRef,
      () => ({
        addText: (kind) => api.current?.addText(kind),
        addShape: (kind) => api.current?.addShape(kind),
        removeImageBackground: async (process) => { await api.current?.removeImageBackground(process); },
        addSVG: async (svg, name) => { await api.current?.addSVG(svg, name); },
        addImage: async (src, name) => {
          await api.current?.addImage(src, name);
        },
        updateSelection: (value) => api.current?.updateSelection(value),
        captureTextSelection: () => api.current?.captureTextSelection(),
        refreshFonts: () => api.current?.refreshFonts(),
        removeSelection: () => api.current?.removeSelection(),
        duplicateSelection: async () => {
          await api.current?.duplicateSelection();
        },
        group: () => api.current?.group(),
        ungroup: () => api.current?.ungroup(),
        align: (direction) => api.current?.align(direction),
        undo: () => api.current?.undo(),
        redo: () => api.current?.redo(),
        load: async (json) => {
          await api.current?.load(json);
        },
        resize: async (width, height, fitContents) => {
          await api.current?.resize(width, height, fitContents);
        },
        getJSON: () => api.current?.getJSON() ?? createTemplate("blank"),
        getLayers: () => api.current?.getLayers() ?? [],
        selectLayer: (id) => api.current?.selectLayer(id),
        toggleLayer: (id, property) => api.current?.toggleLayer(id, property),
        moveLayer: (id, direction) => api.current?.moveLayer(id, direction),
        renameLayer: (id, name) => api.current?.renameLayer(id, name),
        export: (format, multiplier) =>
          api.current?.export(format, multiplier) ?? "",
        setBackground: (color) => api.current?.setBackground(color),
        setBackgroundImage: async (src) => { await api.current?.setBackgroundImage(src); },
        applyTemplate: async (id) => {
          await api.current?.applyTemplate(id);
        },
      }),
      [],
    );

    useEffect(() => {
      if (!host.current) return;
      const mount = document.createElement("div");
      const element = document.createElement("canvas");
      mount.append(element);
      host.current.append(mount);
      const canvas = new Canvas(element, {
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
        backgroundColor: "#f5f2e9",
        preserveObjectStacking: true,
        selectionColor: "rgba(48,75,255,0.10)",
        selectionBorderColor: "#304bff",
        selectionLineWidth: 1,
        stopContextMenu: true,
      });
      canvas.upperCanvasEl.setAttribute(
        "aria-label",
        "Editable design canvas. Use the text and element tools to add objects.",
      );
      let alive = true;
      let busy = false;
      let loadingJSON: DesignJSON | null = null;
      let revision = 0;
      let backgroundRequest = 0;
      let loadController: AbortController | null = null;
      let history: string[] = [];
      let historyIndex = -1;
      let clipboard: Promise<FabricObject[]> | null = null;
      let textTimer: ReturnType<typeof setTimeout> | undefined;
      const pendingImages = new Set<AbortController>();
      let savedTextSelection: { object: IText; range: TextRange } | null = null;

      const rememberTextSelection = (clearCollapsed = false) => {
        const active = canvas.getActiveObject();
        if (!(active instanceof IText)) {
          savedTextSelection = null;
        } else if (active.isEditing && active.selectionEnd > active.selectionStart) {
          savedTextSelection = {
            object: active,
            range: { start: active.selectionStart, end: active.selectionEnd },
          };
        } else if (clearCollapsed || savedTextSelection?.object !== active) {
          savedTextSelection = null;
        }
      };
      const textRange = (object: FabricObject) =>
        savedTextSelection?.object === object ? savedTextSelection.range : undefined;

      const ready = () => alive && !busy;
      const selection = () => {
        const active = canvas.getActiveObject();
        if (savedTextSelection?.object !== active) savedTextSelection = null;
        latest.current.onSelection(active ? describe(active, textRange(active)) : null);
      };
      const snapshot = (): DesignJSON => {
        const scene = canvas.toObject(SERIALIZED_PROPERTIES) as DesignJSON;
        const editing = canvas.getActiveObject();
        if (editing instanceof IText && editing.isEditing && Array.isArray(scene.objects)) {
          const serialized = scene.objects.find((object: NamedObject) =>
            object.id === (editing as NamedObject).id,
          );
          if (serialized) {
            // Editing temporarily disables selection and locks movement. Saving those
            // transient flags would turn a rich-text undo/reload into a locked layer.
            serialized.lockMovementX = false;
            serialized.lockMovementY = false;
            serialized.selectable = true;
          }
        }
        return { ...scene, width: canvas.width, height: canvas.height };
      };
      const notifyHistory = () =>
        latest.current.onHistoryChange(
          historyIndex > 0,
          historyIndex < history.length - 1,
        );
      const emit = () => {
        if (!alive) return;
        canvas.requestRenderAll();
        const thumb = canvas.toDataURL({
          format: "png",
          multiplier: Math.min(240 / canvas.width, 180 / canvas.height),
          enableRetinaScaling: false,
        });
        latest.current.onChange(snapshot(), thumb);
        selection();
        notifyHistory();
      };
      const commit = () => {
        if (!ready()) return;
        clearTimeout(textTimer);
        const value = JSON.stringify(snapshot());
        if (history[historyIndex] !== value) {
          history = history.slice(0, historyIndex + 1);
          history.push(value);
          let bytes = history.reduce(
            (total, entry) => total + entry.length * 2,
            0,
          );
          while (
            history.length > 2 &&
            (history.length > 80 || bytes > 48 * 1024 * 1024)
          ) {
            bytes -= history.shift()!.length * 2;
          }
          historyIndex = history.length - 1;
        }
        emit();
      };
      const load = async (json: DesignJSON, resetHistory: boolean) => {
        const ownRevision = ++revision;
        loadController?.abort();
        pendingImages.forEach((controller) => controller.abort());
        pendingImages.clear();
        loadController = new AbortController();
        const controller = loadController;
        clearTimeout(textTimer);
        busy = true;
        loadingJSON = json;
        setLoading(true);
        setError(null);
        setGuides({});
        savedTextSelection = null;
        canvas.discardActiveObject();
        try {
          const scene = validateCanvasJSON(json, window.location.origin);
          await canvas.loadFromJSON(scene, undefined, {
            signal: controller.signal,
          });
          if (!alive || ownRevision !== revision) return;
          const size = getCanvasSize(scene);
          canvas.setDimensions(size);
          setDimensions(size);
          canvas.renderOnAddRemove = true;
          canvas.getObjects().forEach((object) => prepare(object));
          canvas.requestRenderAll();
          if (resetHistory) {
            history = [JSON.stringify(snapshot())];
            historyIndex = 0;
          }
          busy = false;
          loadingJSON = null;
          setLoading(false);
          emit();
        } catch (cause) {
          if (!alive || controller.signal.aborted || ownRevision !== revision)
            return;
          // Keep edits blocked: the previous page can remain on Fabric after a failed load.
          // Its objects must never be written into the newly requested page.
          canvas.renderOnAddRemove = true;
          setLoading(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "This design could not be loaded.",
          );
          throw cause;
        }
      };
      const find = (id: string) =>
        canvas.getObjects().find((object) => (object as NamedObject).id === id);
      const choose = (objects: FabricObject[]) => {
        savedTextSelection = null;
        canvas.discardActiveObject();
        if (objects.length === 1) canvas.setActiveObject(objects[0]);
        if (objects.length > 1)
          canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
        canvas.requestRenderAll();
        selection();
      };
      const add = (object: FabricObject) => {
        if (!ready()) return;
        canvas.add(prepare(object));
        choose([object]);
        commit();
      };
      const copyObjects = () => {
        const objects = canvas.getActiveObjects();
        canvas.discardActiveObject();
        const copies = Promise.all(
          objects.map((object) => object.clone(SERIALIZED_PROPERTIES)),
        );
        choose(objects);
        return copies;
      };
      const pasteObjects = async (copies: Promise<FabricObject[]>) => {
        const ownRevision = revision;
        const originals = await copies;
        const objects = await Promise.all(
          originals.map((object) => object.clone(SERIALIZED_PROPERTIES)),
        );
        if (!ready() || ownRevision !== revision) return;
        objects.forEach((object) => {
          prepare(object, true);
          object.set({ left: object.left + 24, top: object.top + 24 });
          object.setCoords();
          canvas.add(object);
        });
        choose(objects);
        commit();
      };
      const changeHistory = async (offset: number) => {
        if (!ready()) return;
        const index = historyIndex + offset;
        if (index < 0 || index >= history.length) return;
        const previous = historyIndex;
        historyIndex = index;
        try {
          await load(JSON.parse(history[index]) as DesignJSON, false);
        } catch {
          historyIndex = previous;
          notifyHistory();
        }
      };

      const handle: CanvasHandle = {
        addText(kind) {
          const settings = {
            heading: ["Add a heading", 66, 700],
            subheading: ["Add a subheading", 36, 500],
            body: ["Your story starts here.", 22, 400],
          } as const;
          const [value, fontSize, fontWeight] = settings[kind];
          add(
            new Textbox(value, {
              left: canvas.width * 0.19,
              top: canvas.height * 0.37,
              width: canvas.width * 0.62,
              fontFamily: "Arial",
              fontSize,
              fontWeight,
              fill: "#252821",
            }),
          );
        },
        addShape(kind) {
          const options = {
            left: canvas.width / 2 - 115,
            top: canvas.height / 2 - 85,
            fill: "#d4e78b",
            strokeWidth: 0,
          };
          if (kind === "rectangle")
            add(
              new Rect({ ...options, width: 230, height: 170, rx: 12, ry: 12 }),
            );
          if (kind === "circle") add(new Circle({ ...options, radius: 95 }));
          if (kind === "triangle")
            add(new Triangle({ ...options, width: 200, height: 180 }));
          if (kind === "line")
            add(
              new Line([0, 0, 245, 0], {
                ...options,
                stroke: "#252821",
                strokeWidth: 12,
                strokeLineCap: "round",
              }),
            );
          if (kind === "star") {
            const points = Array.from({ length: 10 }, (_, index) => {
              const angle = (index * Math.PI) / 5 - Math.PI / 2;
              const radius = index % 2 ? 44 : 100;
              return {
                x: Math.cos(angle) * radius + 100,
                y: Math.sin(angle) * radius + 100,
              };
            });
            add(new Polygon(points, options));
          }
        },
        async removeImageBackground(process) {
          if (!ready()) throw new Error("The canvas is still loading.");
          const selected = canvas.getActiveObject();
          const target = selected instanceof FabricImage ? selected : selected instanceof Group && isImageFrame(selected) ? selected.getObjects()[0] : null;
          if (!(target instanceof FabricImage)) throw new Error("Select an image first.");
          const ownRevision = revision, originalSource = target.getSrc();
          const src = await process(originalSource);
          if (!ready() || revision !== ownRevision || !selected || !canvas.getObjects().includes(selected) || target.getSrc() !== originalSource) throw new Error("The image changed while processing. Please select it and retry.");
          const replacement = await FabricImage.fromURL(src);
          if (!ready() || revision !== ownRevision || !canvas.getObjects().includes(selected) || target.getSrc() !== originalSource) return;
          target.setElement(replacement.getElement(), {width: target.width, height: target.height});
          let frame = selected;
          if (selected instanceof FabricImage) {
            canvas.discardActiveObject();
            const index = canvas.getObjects().indexOf(selected);
            frame = roundElement(selected,0);
            canvas.remove(selected);canvas.insertAt(index,prepare(frame));
          }
          if (frame instanceof Group) {
            (frame as StyledObject).cutout=true;
            const border=borderObject(frame);
            styleImageFrame(frame,0,border.strokeWidth,border.stroke);
          }
          target.dirty = true; frame.dirty = true; choose([frame]);
          commit();
        },
        async addSVG(svg, name) {
          if (!ready()) return;
          const ownRevision = revision;
          const parsed = await loadSVGFromString(safeIconSVG(svg));
          const objects = parsed.objects.filter((item): item is FabricObject => !!item);
          if (!ready() || ownRevision !== revision || !objects.length) return;
          const object = new Group(objects);
          object.scale(160 / Math.max(object.width, object.height, 1));
          object.set({left: (canvas.width - object.getScaledWidth()) / 2, top: (canvas.height - object.getScaledHeight()) / 2, fill: "#252821"});
          (object as NamedObject).name = name;
          (object as NamedObject).assetType = "icon";
          add(object);
        },
        async addImage(src, name) {
          if (!ready()) return;
          if (!isSafeCanvasImage(src, window.location.origin))
            throw new Error(
              "Choose a local raster image or a same-origin asset.",
            );
          const ownRevision = revision;
          const controller = new AbortController();
          pendingImages.add(controller);
          try {
            const object = await FabricImage.fromURL(src, {
              crossOrigin: "anonymous",
              signal: controller.signal,
            });
            if (!ready() || ownRevision !== revision) return;
            object.scale(Math.min(480 / object.width, 380 / object.height, 1));
            object.set({
              left: (canvas.width - object.getScaledWidth()) / 2,
              top: (canvas.height - object.getScaledHeight()) / 2,
            });
            (object as NamedObject).name = name ?? "Uploaded image";
            add(object);
          } catch (cause) {
            if (!controller.signal.aborted) throw cause;
          } finally {
            pendingImages.delete(controller);
          }
        },
        updateSelection(properties) {
          if (!ready()) return;
          const allowed = [
            "fill",
            "stroke",
            "strokeWidth",
            "fontFamily",
            "fontSize",
            "fontWeight",
            "fontStyle",
            "underline",
            "textAlign",
            "lineHeight",
            "charSpacing",
            "opacity",
            "angle",
            "cornerRadius",
            "rx",
            "ry",
          ];
          const safe = Object.fromEntries(
            Object.entries(properties).filter(([key]) => allowed.includes(key)),
          );
          const active = canvas.getActiveObjects();
          const needsFrame = active.some(object => object instanceof FabricImage && ["cornerRadius", "stroke", "strokeWidth"].some(key => key in safe));
          const needsRound = "cornerRadius" in safe && active.some(object => canRound(object));
          if (needsFrame || needsRound) canvas.discardActiveObject();
          const updated = active.map((original) => {
              if (isLocked(original)) return original;
              let object = original;
              if ((needsFrame && original instanceof FabricImage) || (needsRound && canRound(original))) {
                object = roundElement(original, Math.max(0, Math.min(1000, Number(safe.cornerRadius ?? (original as StyledObject).cornerRadius ?? 0))));
                if (object !== original) {
                  const index = canvas.getObjects().indexOf(original);
                  canvas.remove(original); canvas.insertAt(index, prepare(object));
                }
              }
              if (object instanceof IText) {
                const range = textRange(object);
                const inline = Object.fromEntries(Object.entries(safe).filter(([key]) =>
                  CHARACTER_STYLES.includes(key as typeof CHARACTER_STYLES[number]),
                ));
                if (range) {
                  object.setSelectionStyles(inline, range.start, range.end);
                  object.set(Object.fromEntries(Object.entries(safe).filter(([key]) =>
                    !(key in inline),
                  )));
                  object.selectionStart = range.start;
                  object.selectionEnd = range.end;
                } else {
                  // A whole-box edit replaces that property in existing rich text runs too.
                  for (const key of CHARACTER_STYLES) {
                    if (key in inline) object.removeStyle(key);
                  }
                  object.set(safe);
                }
                object.dirty = true;
                object.initDimensions();
                if (object.isEditing) object.renderCursorOrSelection();
              } else {
                if ((object as NamedObject).assetType === "icon" && typeof safe.fill === "string") {
                  const color = safe.fill;
                  const recolor = (child: FabricObject) => {
                    if (child.stroke && child.stroke !== "none") child.set("stroke", color);
                    if (child.fill && child.fill !== "none") child.set("fill", color);
                    if (child instanceof Group) child.getObjects().forEach(recolor);
                    child.dirty = true;
                  };
                  recolor(object);
                }
                const visual = { ...safe };
                delete visual.cornerRadius;
                if (object instanceof Line && typeof visual.fill === "string") { visual.stroke = visual.fill; delete visual.fill; }
                if (isImageFrame(object) && object instanceof Group) {
                  const border = borderObject(object);
                  styleImageFrame(object, (object as StyledObject).cornerRadius ?? 0, Number(visual.strokeWidth ?? border.strokeWidth), (visual.stroke ?? border.stroke) as string);
                  delete visual.stroke; delete visual.strokeWidth; delete visual.fill;
                }
                object.set(visual);
              }
              object.setCoords();
              return object;
            });
          if (needsFrame || needsRound) choose(updated);
          commit();
        },
        captureTextSelection() {
          rememberTextSelection();
        },
        refreshFonts() {
          if (!ready()) return;
          cache.clearFontCache();
          const refresh = (object: FabricObject) => {
            if (object instanceof IText) {
              object.dirty = true;
              object.initDimensions();
              object.setCoords();
            }
            if (object instanceof Group) {
              object.getObjects().forEach(refresh);
              object.triggerLayout();
              object.setCoords();
            }
          };
          canvas.getObjects().forEach(refresh);
          emit();
        },
        removeSelection() {
          if (!ready()) return;
          const objects = canvas
            .getActiveObjects()
            .filter((object) => !isLocked(object));
          canvas.discardActiveObject();
          canvas.remove(...objects);
          commit();
        },
        async duplicateSelection() {
          if (ready()) await pasteObjects(copyObjects());
        },
        group() {
          if (!ready()) return;
          const objects = canvas
            .getActiveObjects()
            .sort(
              (a, b) =>
                canvas.getObjects().indexOf(a) - canvas.getObjects().indexOf(b),
            );
          if (objects.length < 2 || objects.some(isLocked)) return;
          canvas.discardActiveObject();
          const index = Math.min(
            ...objects.map((object) => canvas.getObjects().indexOf(object)),
          );
          canvas.remove(...objects);
          const group = prepare(new Group(objects));
          (group as NamedObject).name = "Group";
          canvas.insertAt(index, group);
          choose([group]);
          commit();
        },
        ungroup() {
          if (!ready()) return;
          const group = canvas.getActiveObject();
          if (
            !(group instanceof Group) ||
            group instanceof ActiveSelection ||
            isLocked(group)
          )
            return;
          const index = canvas.getObjects().indexOf(group);
          canvas.discardActiveObject();
          const objects = group.remove(...group.getObjects());
          canvas.remove(group);
          canvas.insertAt(index, ...objects);
          objects.forEach((object) => object.setCoords());
          choose(objects);
          commit();
        },
        align(direction) {
          if (!ready()) return;
          const active = canvas.getActiveObject();
          if (!active || canvas.getActiveObjects().some(isLocked)) return;
          const box = active.getBoundingRect();
          let dx = 0,
            dy = 0;
          if (direction === "left") dx = -box.left;
          if (direction === "center")
            dx = (canvas.width - box.width) / 2 - box.left;
          if (direction === "right") dx = canvas.width - box.left - box.width;
          if (direction === "top") dy = -box.top;
          if (direction === "middle")
            dy = (canvas.height - box.height) / 2 - box.top;
          if (direction === "bottom") dy = canvas.height - box.top - box.height;
          active.set({ left: active.left + dx, top: active.top + dy });
          active.setCoords();
          commit();
        },
        undo() {
          void changeHistory(-1);
        },
        redo() {
          void changeHistory(1);
        },
        async load(json) {
          await load(json, true);
        },
        async resize(width, height, fitContents = false) {
          if (!ready()) return;
          await load(resizeCanvasJSON(snapshot(), width, height, fitContents), false);
          commit();
        },
        getJSON: () => loadingJSON ?? snapshot(),
        getLayers() {
          return [...canvas.getObjects()]
            .reverse()
            .map(
              (object): LayerInfo => ({
                id: (object as NamedObject).id!,
                name: (object as NamedObject).name ?? object.type,
                type: object.type,
                visible: object.visible,
                locked: isLocked(object),
              }),
            );
        },
        selectLayer(id) {
          const object = find(id);
          if (ready() && object) choose([object]);
        },
        toggleLayer(id, property) {
          const object = find(id);
          if (!ready() || !object) return;
          if (property === "visible") {
            object.set({ visible: !object.visible });
            canvas.discardActiveObject();
          } else {
            // Finish temporary editing locks before applying a persistent layer lock.
            if (object instanceof IText && object.isEditing) object.exitEditing();
            const locked = !isLocked(object);
            object.set({
              lockMovementX: locked,
              lockMovementY: locked,
              lockScalingX: locked,
              lockScalingY: locked,
              lockRotation: locked,
              editable: !locked,
              selectable: !locked,
            });
          }
          commit();
        },
        moveLayer(id, direction) {
          const object = find(id);
          if (!ready() || !object) return;
          if (direction === "up") canvas.bringObjectForward(object);
          else canvas.sendObjectBackwards(object);
          commit();
        },
        renameLayer(id, name) {
          const object = find(id);
          if (ready() && object && name.trim()) {
            (object as NamedObject).name = name.trim().slice(0, 100);
            commit();
          }
        },
        export(format, multiplier = 2) {
          if (format === "svg") return canvas.toSVG();
          return canvas.toDataURL({
            format,
            quality: 0.95,
            multiplier: Math.min(4, Math.max(0.1, multiplier)),
            enableRetinaScaling: false,
          });
        },
        setBackground(color) {
          if (ready()) {
            canvas.backgroundColor = color;
            commit();
          }
        },
        async setBackgroundImage(src) {
          if (!ready()) return;
          const request = ++backgroundRequest;
          if (!src) { canvas.backgroundImage = undefined; commit(); return; }
          if (!isSafeCanvasImage(src, window.location.origin)) throw new Error("Choose a local raster image.");
          const ownRevision = revision;
          const controller = new AbortController();
          pendingImages.add(controller);
          try {
            const image = await FabricImage.fromURL(src, { crossOrigin: "anonymous", signal: controller.signal });
            if (!ready() || revision !== ownRevision || request !== backgroundRequest) return;
            const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
            image.set({ scaleX: scale, scaleY: scale, left: (canvas.width - image.width * scale) / 2, top: (canvas.height - image.height * scale) / 2, selectable: false, evented: false });
            canvas.backgroundImage = image;
            commit();
          } catch (error) { if (!controller.signal.aborted) throw error; }
          finally { pendingImages.delete(controller); }
        },
        async applyTemplate(id) {
          await load(createTemplate(id, canvas.width, canvas.height), false);
          commit();
        },
      };
      api.current = handle;

      canvas.on("selection:created", selection);
      canvas.on("selection:updated", selection);
      canvas.on("selection:cleared", selection);
      canvas.on("mouse:down:before", () => {
        // A real canvas click begins a fresh range; toolbar focus never does.
        savedTextSelection = null;
      });
      canvas.on("text:selection:changed", ({ target }) => {
        if (target.isEditing) {
          rememberTextSelection(true);
          selection();
        }
      });
      canvas.on("object:modified", commit);
      canvas.on("text:editing:exited", commit);
      canvas.on("text:changed", () => {
        clearTimeout(textTimer);
        textTimer = setTimeout(commit, 300);
      });
      canvas.on("object:moving", ({ target }) => {
        if (latest.current.grid)
          target.set({
            left: Math.round(target.left / 20) * 20,
            top: Math.round(target.top / 20) * 20,
          });
        target.setCoords();
        const box = target.getBoundingRect();
        const centerX = box.left + box.width / 2,
          centerY = box.top + box.height / 2;
        const threshold =
          5 /
          (Number.isFinite(latest.current.zoom)
            ? Math.max(0.05, latest.current.zoom)
            : 1);
        const x =
          Math.abs(centerX - canvas.width / 2) < threshold
            ? canvas.width / 2
            : undefined;
        const y =
          Math.abs(centerY - canvas.height / 2) < threshold
            ? canvas.height / 2
            : undefined;
        if (x !== undefined) target.set({ left: target.left + x - centerX });
        if (y !== undefined) target.set({ top: target.top + y - centerY });
        target.setCoords();
        setGuides({ x, y });
      });
      canvas.on("mouse:up", () => {
        setGuides({});
        rememberTextSelection(true);
        selection();
      });

      const keydown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (
          !ready() ||
          target?.closest(
            "input, textarea, select, [contenteditable=true], [role=dialog]",
          )
        )
          return;
        const active = canvas.getActiveObject();
        if (active instanceof IText && active.isEditing) return;
        const command = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (command && key === "z") {
          event.preventDefault();
          event.shiftKey ? handle.redo() : handle.undo();
        } else if (command && key === "y") {
          event.preventDefault();
          handle.redo();
        } else if (command && key === "c" && active) {
          event.preventDefault();
          clipboard = copyObjects();
        } else if (command && key === "v" && clipboard) {
          event.preventDefault();
          void pasteObjects(clipboard);
        } else if (command && key === "d" && active) {
          event.preventDefault();
          void handle.duplicateSelection();
        } else if (command && key === "g") {
          event.preventDefault();
          event.shiftKey ? handle.ungroup() : handle.group();
        } else if (command && key === "a") {
          event.preventDefault();
          choose(
            canvas
              .getObjects()
              .filter((object) => object.visible && !isLocked(object)),
          );
        } else if (key === "delete" || key === "backspace") {
          if (active) {
            event.preventDefault();
            handle.removeSelection();
          }
        } else if (key === "escape") {
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        } else if (
          active &&
          ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key) &&
          !canvas.getActiveObjects().some(isLocked)
        ) {
          event.preventDefault();
          const step = event.shiftKey ? 10 : 1;
          const offset = new Point(
            key === "arrowleft" ? -step : key === "arrowright" ? step : 0,
            key === "arrowup" ? -step : key === "arrowdown" ? step : 0,
          );
          active.set({
            left: active.left + offset.x,
            top: active.top + offset.y,
          });
          active.setCoords();
          commit();
        }
      };
      window.addEventListener("keydown", keydown);
      void load(
        latest.current.initialJSON ?? createTemplate("studio"),
        true,
      ).catch(() => undefined);

      return () => {
        alive = false;
        revision++;
        api.current = null;
        clearTimeout(textTimer);
        loadController?.abort();
        pendingImages.forEach((controller) => controller.abort());
        window.removeEventListener("keydown", keydown);
        void canvas.dispose();
        mount.remove();
      };
    }, []);

    const scale = Number.isFinite(props.zoom)
      ? Math.min(2, Math.max(0.05, props.zoom))
      : 1;
    return (
      <div
        className="design-canvas"
        style={{
          position: "relative",
          width: dimensions.width * scale,
          height: dimensions.height * scale,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: dimensions.width,
            height: dimensions.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            boxShadow: "0 4px 24px rgba(37,40,33,0.10)",
          }}
        >
          <div
            ref={host}
            style={{ width: dimensions.width, height: dimensions.height }}
          />
          {props.grid && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                backgroundImage:
                  "radial-gradient(circle, rgba(37,40,33,0.25) 0.8px, transparent 0.8px)",
                backgroundSize: "20px 20px",
              }}
            />
          )}
          {guides.x !== undefined && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: guides.x,
                top: 0,
                bottom: 0,
                borderLeft: "1px dashed #8d6ddb",
                pointerEvents: "none",
              }}
            />
          )}
          {guides.y !== undefined && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                top: guides.y,
                left: 0,
                right: 0,
                borderTop: "1px dashed #8d6ddb",
                pointerEvents: "none",
              }}
            />
          )}
          {loading && (
            <div
              aria-label="Loading design"
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(245,242,233,.55)",
                display: "grid",
                placeItems: "center",
                color: "#73776b",
                fontSize: 18,
              }}
            >
              Opening your canvas…
            </div>
          )}
          {error && (
            <div
              role="alert"
              style={{
                position: "absolute",
                inset: 0,
                background: "#f5f2e9",
                display: "grid",
                placeItems: "center",
                padding: 80,
                textAlign: "center",
                color: "#9a3939",
              }}
            >
              {error}
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default DesignCanvas;

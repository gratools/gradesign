"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Cloud,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileJson,
  FolderOpen,
  Grid2X2,
  GripVertical,
  Group,
  HelpCircle,
  ImagePlus,
  Layers,
  LayoutTemplate,
  Link,
  LoaderCircle,
  Lock,
  Maximize2,
  MessageCircle,
  Minus,
  MoreHorizontal,
  MousePointer2,
  Palette,
  PanelLeftClose,
  Play,
  Plus,
  Redo2,
  Search,
  Settings2,
  Shapes,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Underline,
  Undo2,
  Unlock,
  Upload,
  User,
  Users,
  X,
  ZoomIn,
  Bold,
  Italic,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  CanvasHandle,
  SelectionInfo,
  LayerInfo,
} from "@/lib/canvas-types";
import { validateCanvasJSON } from "@/lib/canvas-types";
import { templates, createTemplate } from "@/lib/templates";
import { useCollaboration } from "@/lib/use-collaboration";
import {
  api,
  API_URL,
  downloadFile,
  freshProject,
  isProject,
  STORAGE_KEY,
  type Project,
  type DesignPage,
} from "@/lib/project";
import { Button } from "./ui/button";
import CloudProjects from "./cloud-projects";
import ColorPicker from "./color-picker";
import FontManager from "./font-manager";
import FontSizeInput from "./font-size-input";
import SizePicker from "./size-picker";
import { getCanvasSize, resizeCanvasJSON } from "@/lib/document-size";
import { fontOptions, ensureFontsForCanvas, ensureFontFamily, embedFontsInSVG, type CustomFont } from "@/lib/fonts";
import { readProjects, saveProject, deleteProject, restoreProject, readTrashedProjects } from "@/lib/project-storage";

const DesignCanvas = dynamic(() => import("./design-canvas"), {
  ssr: false,
  loading: () => (
    <div className="canvas-loading">
      <LoaderCircle className="spin" /> Preparing your canvas…
    </div>
  ),
});
type Tool = "Design" | "Elements" | "Text" | "Uploads" | "Brand" | "Projects";
type Modal = "export" | "share" | "account" | "help" | null;
const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "";
const tools: { name: Tool; icon: LucideIcon }[] = [
  { name: "Design", icon: LayoutTemplate },
  { name: "Elements", icon: Shapes },
  { name: "Text", icon: Type },
  { name: "Uploads", icon: Upload },
  { name: "Brand", icon: Palette },
  { name: "Projects", icon: FolderOpen },
];
function IconButton({
  icon: Icon,
  label,
  active,
  ...props
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          aria-label={label}
          className={`icon-button ${active ? "active" : ""}`}
          {...props}
        >
          <Icon size={18} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={7}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function TemplateThumb({ id, small = false }: { id: string; small?: boolean }) {
  return (
    <div className={`template-art art-${id} ${small ? "small" : ""}`}>
      <span className="art-kicker">
        {id === "botanical"
          ? "SLOW LIVING STUDIO"
          : id === "midnight"
            ? "AFTER HOURS / VOL. 04"
            : "A LITTLE SPACE FOR BIG IDEAS"}
      </span>
      <span className="art-title">
        {id === "botanical" ? (
          <>
            Grow
            <br />
            <em>at your pace.</em>
          </>
        ) : id === "midnight" ? (
          <>
            Ideas come
            <br />
            alive.
          </>
        ) : (
          <>
            MAKE
            <br />
            <em>room for</em>
            <br />
            possibility.
          </>
        )}
      </span>
      <span className="art-orbit" />
      <span className="art-shape" />
      <span className="art-footer">
        {id === "botanical"
          ? "NATURE KNOWS THE WAY."
          : id === "midnight"
            ? "CREATE WITHOUT LIMITS."
            : "START SOMETHING GOOD. ↗"}
      </span>
    </div>
  );
}
export default function Studio() {
  const canvas = useRef<CanvasHandle>(null),
    stage = useRef<HTMLDivElement>(null),
    imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    activeRef = useRef(""),
    skipSave = useRef(false);
  const [project, setProject] = useState<Project | null>(null),
    [savedProjects, setSavedProjects] = useState<Project[]>([]),
    [activePage, setActivePage] = useState(""),
    [tool, setTool] = useState<Tool>("Design"),
    [sidebar, setSidebar] = useState(true),
    [rightPanel, setRightPanel] = useState<"layers" | "comments" | null>(
      "layers",
    );
  const [selection, setSelection] = useState<SelectionInfo | null>(null),
    [layers, setLayers] = useState<LayerInfo[]>([]),
    [history, setHistory] = useState([false, false]),
    [zoom, setZoom] = useState(0.66),
    [fit, setFit] = useState(0.66),
    [grid, setGrid] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [modal, setModal] = useState<Modal>(null),
    [toast, setToast] = useState(""),
    [saveState, setSaveState] = useState("Saved on this device"),
    [busy, setBusy] = useState(false),
    [exportFormat, setExportFormat] = useState("png"),
    [exportScale, setExportScale] = useState("2"),
    [exportAll, setExportAll] = useState(true),
    [comment, setComment] = useState(""),
    [pinMode, setPinMode] = useState(false),
    [presentation, setPresentation] = useState(false),
    [animate, setAnimate] = useState(false),
    [paletteColor, setPaletteColor] = useState("#2f4bff"),
    [brandTarget, setBrandTarget] = useState<"selection" | "background">("selection");
  const [pageLoading, setPageLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [trashedProjects, setTrashedProjects] = useState<Project[]>([]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const fontRequest = useRef(0);
  const resizeHistory = useRef(new Map<string, { pages: DesignPage[]; comments: Project["comments"] }>());
  const { width: pageWidth, height: pageHeight } = getCanvasSize(project?.pages.find(p => p.id === activePage)?.canvas);
  const [user, setUser] = useState<{
      id: string;
      name: string;
      email: string;
    } | null>(null),
    [authMode, setAuthMode] = useState<"login" | "signup">("signup"),
    [authError, setAuthError] = useState(""),
    [workspaceId, setWorkspaceId] = useState(""),
    [remoteId, setRemoteId] = useState(""),
    [remoteRevision, setRemoteRevision] = useState(0),
    [shareUrl, setShareUrl] = useState("");
  const [collabEnabled, setCollabEnabled] = useState(false),
    [collabJoined, setCollabJoined] = useState(false);
  const [presence] = useState(() => ({
    name: `Guest ${Math.floor(Math.random() * 900 + 100)}`,
    color: ["#8b5cf6", "#0d9488", "#d97706", "#db2777"][
      Math.floor(Math.random() * 4)
    ],
  }));
  const collabEnabledRef = useRef(false),
    canvasLoading = useRef(false),
    canvasLoadRevision = useRef(0),
    remotePages = useRef<DesignPage[] | null>(null),
    lastCursorSent = useRef(0),
    loadedSnapshot = useRef<{
      json: Record<string, unknown>;
      thumbnail: string;
    } | null>(null);
  collabEnabledRef.current = collabEnabled;
  const notify = useCallback((message: string) => setToast(message), []);
  const loadPage = useCallback(
    async (page: DesignPage, fonts: CustomFont[] = projectRef.current?.fonts ?? []) => {
      const revision = ++canvasLoadRevision.current;
      canvasLoading.current = true;
      setPageLoading(true);
      loadedSnapshot.current = null;
      let loaded = false;
      try {
        await ensureFontsForCanvas(page.canvas, fonts);
        if (revision !== canvasLoadRevision.current) return;
        loadedSnapshot.current = null;
        await canvas.current?.load(page.canvas);
        if (revision !== canvasLoadRevision.current) return;
        loaded = true;
        activeRef.current = page.id;
        setActivePage(page.id);
        setSelection(null);
        resizeHistory.current.clear();
      } catch (e) {
        if (revision === canvasLoadRevision.current)
          notify(
            e instanceof Error ? e.message : "This page could not be loaded.",
          );
      } finally {
        if (revision === canvasLoadRevision.current) {
          canvasLoading.current = false;
          setPageLoading(false);
          const snapshot = loadedSnapshot.current as {
            json: Record<string, unknown>;
            thumbnail: string;
          } | null;
          if (snapshot && loaded)
            setProject((p) =>
              p
                ? {
                    ...p,
                    pages: p.pages.map((item) =>
                      item.id === page.id
                        ? {
                            ...item,
                            canvas: collabEnabledRef.current
                              ? item.canvas
                              : snapshot.json,
                            thumbnail: snapshot.thumbnail,
                          }
                        : item,
                    ),
                  }
                : p,
            );
          loadedSnapshot.current = null;
          setLayers(canvas.current?.getLayers() ?? []);
        }
      }
    },
    [notify],
  );
  const collaboration = useCollaboration({
    enabled:
      collabEnabled &&
      Boolean(project) &&
      Boolean(API_URL ? remoteId : project?.id),
    roomId: API_URL ? remoteId : (project?.id ?? ""),
    serverUrl: COLLAB_URL || undefined,
    user: { name: user?.name ?? presence.name, color: presence.color },
    initialPages: project?.pages ?? [],
    initialFonts: project?.fonts ?? [],
    onRemoteFonts: fonts => {
      if (!collabEnabledRef.current) return;
      if (projectRef.current) projectRef.current = { ...projectRef.current, fonts };
      setProject(p => p ? { ...p, fonts } : p);
    },
    onRemotePages: (pages) => {
      if (!collabEnabledRef.current) return;
      if (!pages.length) {
        collabEnabledRef.current = false;
        setCollabEnabled(false);
        setCollabJoined(false);
        notify(
          "This live room has no pages. Your local copy is still available.",
        );
        return;
      }
      remotePages.current = pages;
      setProject((p) =>
        p ? { ...p, pages, updatedAt: new Date().toISOString() } : p,
      );
      const page = pages.find((p) => p.id === activeRef.current) ?? pages[0];
      // Start suppression before Fabric loads. Its completion emits onChange;
      // that snapshot must never be republished as a local edit.
      void loadPage(page);
    },
    getToken: API_URL
      ? async () => {
          if (!remoteId)
            throw new Error("Save the design to your workspace first.");
          const result = await api<{ token: string }>(
            `/api/designs/${remoteId}/collaboration-token`,
            { method: "POST" },
          );
          return result.token;
        }
      : undefined,
  });
  useEffect(() => {
    if (collabEnabled && collaboration.status === "connected")
      setCollabJoined(true);
  }, [collabEnabled, collaboration.status]);
  useEffect(() => {
    if (!collabEnabled || !collabJoined || !project) return;
    if (remotePages.current === project.pages) {
      remotePages.current = null;
      return;
    }
    remotePages.current = null;
    try {
      collaboration.updatePages(project.pages);
    } catch (e) {
      collabEnabledRef.current = false;
      setCollabEnabled(false);
      setCollabJoined(false);
      notify(
        e instanceof Error
          ? e.message
          : "Live editing stopped. Your design is saved locally.",
      );
    }
  }, [
    collabEnabled,
    collabJoined,
    project?.pages,
    collaboration.updatePages,
    notify,
  ]);
  useEffect(() => {
    const guard = (e: KeyboardEvent) => {
      if (!collabEnabled) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        )
      )
        return;
      const key = e.key.toLowerCase(),
        undo = (e.ctrlKey || e.metaKey) && (key === "z" || key === "y");
      if (undo || !collabJoined) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (undo) notify("Leave live editing to use local undo and redo.");
      }
    };
    window.addEventListener("keydown", guard, true);
    return () => window.removeEventListener("keydown", guard, true);
  }, [collabEnabled, collabJoined, notify]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let saved: Project[] = [];
      try { saved = await readProjects(); } catch { notify("Saved designs could not be read. You can import a project backup."); }
      const next = saved[0] ?? freshProject();
      try { await ensureFontsForCanvas(next.pages[0].canvas, next.fonts ?? []); }
      catch (e) { notify(e instanceof Error ? e.message : "Some fonts could not be loaded."); }
      if (cancelled) return;
      setSavedProjects(saved);
      void readTrashedProjects().then(items => { if (!cancelled) setTrashedProjects(items); }).catch(() => {});
      setProject(next);
      setActivePage(next.pages[0].id);
      activeRef.current = next.pages[0].id;
    })();
    if (API_URL)
      api<{ user: typeof user; workspaces: { id: string }[] }>("/api/session")
        .then((s) => {
          setUser(s.user);
          setWorkspaceId(s.workspaces[0]?.id ?? "");
        })
        .catch(() =>
          notify("Your backend is unavailable. Local editing still works."),
        );
    return () => { cancelled = true; };
  }, [notify]);
  useEffect(() => {
    if (!project || skipSave.current || projectBusy) return;
    setSaveState("Saving…");
    let current = true;
    const timer = setTimeout(async () => {
      if (skipSave.current) return;
      try {
        const list = await saveProject(project);
        if (!current) return;
        setSavedProjects(list);
        setSaveState("Saved on this device");
      } catch {
        if (current) setSaveState("Unable to save — export a backup");
      }
    }, 550);
    return () => { current = false; clearTimeout(timer); };
  }, [project, projectBusy]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const z = Math.min(
        (entry.contentRect.width - 90) / pageWidth,
        (entry.contentRect.height - 108) / pageHeight,
        0.95,
      );
      const value = Math.max(0.05, z);
      setFit(value);
      setZoom(value);
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [sidebar, rightPanel, presentation, project?.id, pageWidth, pageHeight]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPresentation(false);
        setPinMode(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        notify("Your design is saved automatically on this device.");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [notify]);
  const onChange = useCallback(
    (json: Record<string, unknown>, thumbnail: string) => {
      if (canvasLoading.current) {
        loadedSnapshot.current = { json, thumbnail };
        return;
      }
      const resizeState = resizeHistory.current.get(JSON.stringify(json));
      setProject(p => p ? { ...p,
        pages: p.pages.map(page => page.id === activeRef.current ? { ...page, canvas: json, thumbnail } : resizeState?.pages.find(saved => saved.id === page.id) ?? page),
        comments: p.comments.map(comment => { const saved = resizeState?.comments.find(c => c.id === comment.id); return saved ? { ...comment, x: saved.x, y: saved.y } : comment; }),
        updatedAt: new Date().toISOString(),
      } : p);
      setLayers(canvas.current?.getLayers() ?? []);
    },
    [],
  );
  const onSelection = useCallback((s: SelectionInfo | null) => {
    setSelection(s);
    setLayers(canvas.current?.getLayers() ?? []);
  }, []);
  const onHistory = useCallback(
    (undo: boolean, redo: boolean) => setHistory([undo, redo]),
    [],
  );
  const update = (props: Record<string, unknown>) =>
    canvas.current?.updateSelection(props);
  const applyFont = async (family: string) => {
    canvas.current?.captureTextSelection();
    const request = ++fontRequest.current;
    const identity = () => JSON.stringify([projectRef.current?.id, activeRef.current, selectionRef.current?.id, selectionRef.current?.textSelection]);
    const selected = identity();
    try {
      await ensureFontFamily(family, projectRef.current?.fonts ?? []);
      if (request !== fontRequest.current || identity() !== selected) return;
      canvas.current?.refreshFonts();
      update({ fontFamily: family });
    } catch (e) { notify(e instanceof Error ? e.message : "Could not load font."); }
  };
  const switchPage = async (page: DesignPage) => {
    const previousId = activeRef.current;
    const latestJSON = !canvasLoading.current
      ? canvas.current?.getJSON()
      : undefined;
    if (latestJSON)
      setProject((p) =>
        p
          ? {
              ...p,
              pages: p.pages.map((item) =>
                item.id === previousId ? { ...item, canvas: latestJSON } : item,
              ),
              updatedAt: new Date().toISOString(),
            }
          : p,
      );
    await loadPage(
      page.id === previousId && latestJSON
        ? { ...page, canvas: latestJSON }
        : page,
    );
  };
  const addPage = async (duplicate = false) => {
    if (!project) return;
    const page: DesignPage = {
      id: crypto.randomUUID(),
      name: `Page ${project.pages.length + 1}`,
      canvas: duplicate
        ? (canvas.current?.getJSON() ?? {})
        : { version: "6.9.0", objects: [], background: "#ffffff", width: pageWidth, height: pageHeight },
    };
    setProject({ ...project, pages: [...project.pages, page] });
    await switchPage(page);
    notify(duplicate ? "Page duplicated" : "A fresh page, a fresh start.");
  };
  const deletePage = async () => {
    if (!project || project.pages.length === 1) return;
    const pages = project.pages.filter((p) => p.id !== activePage);
    setProject({ ...project, pages });
    await switchPage(pages[0]);
  };
  const movePage = (direction: number) => {
    if (!project) return;
    const pages = [...project.pages],
      index = pages.findIndex((p) => p.id === activePage),
      target = index + direction;
    if (target < 0 || target >= pages.length) return;
    [pages[index], pages[target]] = [pages[target], pages[index]];
    setProject({ ...project, pages });
  };
  const leaveCollaboration = () => {
    collabEnabledRef.current = false;
    setCollabEnabled(false);
    setCollabJoined(false);
    remotePages.current = null;
    collaboration.setCursor(null);
  };
  const openProject = async (p: Project) => {
    try {
      const validated = {
        ...p,
        pages: p.pages.map((page) => ({
          ...page,
          canvas: validateCanvasJSON(page.canvas, window.location.origin),
        })),
      };
      await ensureFontsForCanvas(validated.pages[0].canvas, validated.fonts ?? []);
      leaveCollaboration();
      setProject(validated);
      setRemoteId("");
      setShareUrl("");
      await loadPage(validated.pages[0], validated.fonts ?? []);
      notify("Project opened");
      return true;
    } catch (e) {
      notify(
        e instanceof Error ? e.message : "This project could not be opened.",
      );
      return false;
    }
  };
  const newProject = async () => {
    leaveCollaboration();
    const p = freshProject();
    setProject(p);
    setRemoteId("");
    setShareUrl("");
    await loadPage(p.pages[0], []);
    setTool("Design");
    notify("Your new design is ready");
  };
  const removeProject = async () => {
    if (!deleteTarget || projectBusy) return;
    setProjectBusy(true);
    skipSave.current = true;
    try {
      const isCurrent = deleteTarget.id === projectRef.current?.id;
      if (isCurrent && projectRef.current) {
        const json = canvas.current?.getJSON();
        await saveProject({ ...projectRef.current, pages: projectRef.current.pages.map(page => page.id === activeRef.current && json ? { ...page, canvas: json } : page) });
      }
      const remaining = await deleteProject(deleteTarget.id);
      setSavedProjects(remaining);
      setTrashedProjects(await readTrashedProjects());
      if (isCurrent) {
        leaveCollaboration();
        setRemoteId(""); setShareUrl("");
        let next = remaining[0] ?? freshProject();
        try { await ensureFontsForCanvas(next.pages[0].canvas, next.fonts ?? []); }
        catch { next = freshProject(); }
        setProject(next);
        await loadPage(next.pages[0], next.fonts ?? []);
      }
      setDeleteTarget(null);
      notify("Project moved to Trash. You can restore it below.");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not delete this project."); }
    finally { skipSave.current = false; setProjectBusy(false); }
  };
  const recoverProject = async (id: string) => {
    setProjectBusy(true);
    try {
      setSavedProjects(await restoreProject(id));
      setTrashedProjects(await readTrashedProjects());
      notify("Project restored");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not restore this project."); }
    finally { setProjectBusy(false); }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 40 * 1024 * 1024)
        throw new Error("Please choose a project under 40 MB.");
      const parsed: unknown = JSON.parse(await file.text());
      if (!isProject(parsed))
        throw new Error("This is not a valid gradesign. project.");
      await openProject({ ...parsed, id: crypto.randomUUID() });
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not import project");
    }
  };
  const uploadImages = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      if (
        !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
          file.type,
        )
      ) {
        notify("Choose a PNG, JPG, WebP, or GIF image.");
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        notify("Choose an image smaller than 8 MB.");
        continue;
      }
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      try {
        await canvas.current?.addImage(src);
        notify("Image added to your design");
      } catch {
        notify("That image could not be loaded.");
      }
    }
  };
  const exportDesign = async () => {
    if (!canvas.current || !project) return;
    setBusy(true);
    try {
      const currentJSON = canvas.current.getJSON();
      const snapshot = { ...project, pages: project.pages.map(p => p.id === activePage ? { ...p, canvas: currentJSON } : p) };
      await ensureFontsForCanvas(currentJSON, project.fonts ?? []);
      canvas.current.refreshFonts();
      const name = project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
      if (exportFormat === "json") {
        downloadFile(
          new Blob([JSON.stringify(snapshot, null, 2)], {
            type: "application/json",
          }),
          `${name}.gradesign.json`,
        );
      } else if (exportFormat === "pdf") {
        const { jsPDF } = await import("jspdf");
        const { StaticCanvas } = await import("fabric");
        const pages = exportAll ? snapshot.pages : snapshot.pages.filter(p => p.id === activePage);
        const first = getCanvasSize(pages[0].canvas);
        const pdf = new jsPDF({
          orientation: first.width >= first.height ? "landscape" : "portrait",
          unit: "px",
          format: [first.width, first.height],
          hotfixes: ["px_scaling"],
        });
        for (let i = 0; i < pages.length; i++) {
          const size = getCanvasSize(pages[i].canvas);
          await ensureFontsForCanvas(pages[i].canvas, project.fonts ?? []);
          const c = new StaticCanvas(undefined, size);
          try {
            await c.loadFromJSON(validateCanvasJSON(pages[i].canvas, window.location.origin));
            if (i) pdf.addPage([size.width, size.height], size.width >= size.height ? "landscape" : "portrait");
            pdf.addImage(c.toDataURL({ format: "png", multiplier: Number(exportScale) }), "PNG", 0, 0, size.width, size.height);
          } finally { await c.dispose(); }
        }
        pdf.save(`${name}.pdf`);
      } else {
        const format = exportFormat as "png" | "jpeg" | "svg";
        let result = canvas.current.export(format, Number(exportScale));
        if (format === "svg") result = await embedFontsInSVG(result, currentJSON, project.fonts ?? []);
        downloadFile(
          format === "svg"
            ? new Blob([result], { type: "image/svg+xml" })
            : result,
          `${name}.${format === "jpeg" ? "jpg" : format}`,
        );
      }
      setModal(null);
      notify("Made by you. Ready to share.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };
  const cloudSave = async () => {
    if (!project) return;
    if (collabEnabled) {
      notify(
        "Leave live editing before saving a workspace snapshot or creating a view link.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!user) {
        setModal("account");
        return;
      }
      const json = !canvasLoading.current
        ? canvas.current?.getJSON()
        : undefined;
      const snapshot = json
        ? {
            ...project,
            pages: project.pages.map((page) =>
              page.id === activeRef.current ? { ...page, canvas: json } : page,
            ),
          }
        : project;
      setProject(snapshot);
      const body = remoteId
        ? {
            revision: remoteRevision,
            title: snapshot.title,
            document: snapshot,
          }
        : { workspaceId, title: snapshot.title, document: snapshot };
      const result = await api<{ design: { id: string; revision: number } }>(
        remoteId ? `/api/designs/${remoteId}` : "/api/designs",
        { method: remoteId ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      setRemoteId(result.design.id);
      setRemoteRevision(result.design.revision);
      notify("Saved to your workspace");
      return result.design.id;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Cloud save failed");
    } finally {
      setBusy(false);
    }
  };
  const createShare = async () => {
    const id = await cloudSave();
    if (!id) return;
    try {
      const result = await api<{ token: string; url: string }>(
        `/api/designs/${id}/share`,
        { method: "POST", body: JSON.stringify({ permission: "VIEW" }) },
      );
      setShareUrl(result.url);
      notify("View-only link created");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not create link");
    }
  };
  const toggleCollaboration = async () => {
    if (collabEnabled) {
      leaveCollaboration();
      notify("Live editing ended. Your design is saved on this device.");
      return;
    }
    if (!project || !COLLAB_URL) return;
    if (API_URL && !(await cloudSave())) return;
    const json = !canvasLoading.current ? canvas.current?.getJSON() : undefined;
    if (json)
      setProject((p) =>
        p
          ? {
              ...p,
              pages: p.pages.map((page) =>
                page.id === activeRef.current
                  ? { ...page, canvas: json }
                  : page,
              ),
            }
          : p,
      );
    remotePages.current = null;
    setCollabJoined(false);
    collabEnabledRef.current = true;
    setCollabEnabled(true);
    setModal(null);
    notify("Connecting to your live editing room…");
  };
  const sendCursor = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!collabEnabled || !collabJoined || collaboration.status !== "connected")
      return;
    const now = performance.now();
    if (now - lastCursorSent.current < 50) return;
    lastCursorSent.current = now;
    const rect = e.currentTarget.getBoundingClientRect();
    collaboration.setCursor({
      pageId: activeRef.current,
      x: Math.max(
        0,
        Math.min(pageWidth, ((e.clientX - rect.left) * pageWidth) / rect.width),
      ),
      y: Math.max(
        0,
        Math.min(pageHeight, ((e.clientY - rect.top) * pageHeight) / rect.height),
      ),
    });
  };
  const auth = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(`/api/auth/${authMode}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      const session = await api<{
        user: typeof user;
        workspaces: { id: string }[];
      }>("/api/session");
      setUser(session.user);
      setWorkspaceId(session.workspaces[0]?.id ?? "");
      setModal(null);
      notify("Welcome to your workspace");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  };
  const resizePages = async (width: number, height: number, all: boolean, fitContents: boolean) => {
    if (!project || !canvas.current) return;
    const current = canvas.current.getJSON();
    const sourcePages = project.pages.map(p => p.id === activePage ? { ...p, canvas: current } : p);
    const targetIds = new Set(sourcePages.filter(p => all || p.id === activePage).map(p => p.id));
    const comments = project.comments.map(comment => {
      if (!fitContents || !targetIds.has(comment.pageId)) return comment;
      const previous = getCanvasSize(sourcePages.find(p => p.id === comment.pageId)?.canvas);
      const scale = Math.min(width / previous.width, height / previous.height);
      return { ...comment, x: comment.x * scale + (width - previous.width * scale) / 2, y: comment.y * scale + (height - previous.height * scale) / 2 };
    });
    const resizedPages = sourcePages.map(p => targetIds.has(p.id) ? { ...p, canvas: resizeCanvasJSON(p.canvas, width, height, fitContents), thumbnail: undefined } : p);
    resizeHistory.current.set(JSON.stringify(current), { pages: sourcePages.filter(p => targetIds.has(p.id)), comments: project.comments });
    try {
      await canvas.current.resize(width, height, fitContents);
      const resizedJSON = canvas.current.getJSON();
      resizeHistory.current.set(JSON.stringify(resizedJSON), { pages: resizedPages.filter(p => targetIds.has(p.id)), comments });
      setProject(p => p ? { ...p, comments, updatedAt: new Date().toISOString(), pages: resizedPages.map(page => page.id === activePage ? { ...page, canvas: resizedJSON, thumbnail: p.pages.find(saved => saved.id === page.id)?.thumbnail } : page) } : p);
      notify(`Presentation resized to ${width} × ${height}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not resize this presentation.");
    }
  };
  const addComment = (x = pageWidth / 2, y = pageHeight / 2) => {
    if (!comment.trim() || !project) return;
    setProject({
      ...project,
      comments: [
        ...project.comments,
        {
          id: crypto.randomUUID(),
          pageId: activePage,
          text: comment.trim(),
          x,
          y,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setComment("");
    setPinMode(false);
    notify("Comment pinned to this page");
  };
  const pageIndex = Math.max(
    0,
    project?.pages.findIndex((p) => p.id === activePage) ?? 0,
  );
  if (!project)
    return (
      <div className="boot-screen">
        <span className="wordmark">
          <img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/logo.svg"} alt="gradesign." className="brand-wordmark" />
        </span>
        <LoaderCircle className="spin" />
      </div>
    );
  return (
    <Tooltip.Provider delayDuration={250}>
      <div className={`studio ${presentation ? "presenting" : ""}`}>
        <header className="topbar">
          <button
            className="wordmark"
            onClick={() => setTool("Projects")}
            aria-label="Open gradesign. projects"
          >
            <img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/logo.svg"} alt="gradesign." className="brand-wordmark" />
          </button>
          <div className="top-divider" />
          <button
            className="workspace-link"
            onClick={() => setTool("Projects")}
          >
            Personal workspace <ChevronRight size={14} />
          </button>
          <input
            className="project-title"
            aria-label="Design title"
            placeholder="Unnamed project"
            value={project.title}
            onChange={(e) => setProject({ ...project, title: e.target.value })}
            onBlur={() => setProject(p => p && !p.title.trim() ? { ...p, title: "Unnamed project" } : p)}
          />
          <span className="save-status" role="status" aria-live="polite">
            {collabEnabled ? (
              <>
                <Users size={15} />
                {collaboration.status === "connected"
                  ? `Live • ${collaboration.peers.length + 1}`
                  : collaboration.status === "error"
                    ? "Connection unavailable"
                    : collaboration.status === "disconnected"
                      ? "Reconnecting…"
                      : "Connecting…"}
              </>
            ) : (
              <>
                <CheckCheck size={15} />
                {saveState}
              </>
            )}
          </span>
          <div className="top-actions">
            <button
              className="avatar"
              onClick={() => setModal("account")}
              aria-label="Your account"
            >
              {user?.name?.slice(0, 1) ?? "Y"}
            </button>
            <Button variant="secondary" onClick={() => setPresentation(true)}>
              <Play size={15} />
              Present
            </Button>
            <Button onClick={() => setModal("share")}>
              <Users size={16} />
              Share <ChevronDown size={14} />
            </Button>
          </div>
        </header>
        <div className="editor-body" inert={pageLoading || projectBusy || (collabEnabled && !collabJoined)} aria-busy={pageLoading || projectBusy}>
          <nav className="tool-rail" aria-label="Editor tools">
            {tools.map(({ name, icon: Icon }) => (
              <button
                key={name}
                onClick={() => {
                  setTool(name);
                  setSidebar(true);
                  setSearch("");
                }}
                className={tool === name && sidebar ? "selected" : ""}
              >
                <Icon size={22} />
                <span>{name}</span>
              </button>
            ))}
            <div className="rail-bottom">
              <button onClick={() => setModal("help")}>
                <HelpCircle size={22} />
                <span>Help</span>
              </button>
            </div>
          </nav>
          {sidebar && (
            <aside className="asset-panel">
              <div className="panel-heading">
                <h2>{tool === "Design" ? "Make it yours" : tool}</h2>
                <IconButton
                  icon={PanelLeftClose}
                  label="Collapse sidebar"
                  onClick={() => setSidebar(false)}
                />
              </div>
              {tool === "Design" && (
                <>
                  <p className="panel-subtitle">
                    A starting point for your next big idea.
                  </p>
                  <label className="search-box">
                    <Search size={17} />
                    <input
                      aria-label="Search templates"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search templates"
                    />
                  </label>
                  <div className="filter-pills">
                    {["All", "Social", "Presentation"].map((f) => (
                      <button
                        key={f}
                        className={filter === f ? "selected" : ""}
                        onClick={() => setFilter(f)}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="section-label">
                    Curated for you <Sparkles size={14} />
                  </div>
                  <div className="template-grid">
                    {templates
                      .filter(
                        (t) =>
                          t.id !== "blank" &&
                          (!search ||
                            t.name
                              .toLowerCase()
                              .includes(search.toLowerCase())) &&
                          (filter === "All" ||
                            (filter === "Social"
                              ? t.id !== "midnight"
                              : t.id === "midnight")),
                      )
                      .map((t) => (
                        <button
                          className="template-card"
                          key={t.id}
                          onClick={async () => {
                            await canvas.current?.applyTemplate(t.id);
                            notify(
                              `${t.name} applied — undo to restore your previous design.`,
                            );
                          }}
                        >
                          <TemplateThumb id={t.id} />
                          <div className="template-label">
                            <span>{t.name}</span>
                            <ArrowUpRight size={13} />
                          </div>
                          <small>
                            {t.id === "midnight"
                              ? "Presentation"
                              : "Social & editorial"}
                          </small>
                        </button>
                      ))}
                    <button
                      className="template-card"
                      onClick={() => canvas.current?.applyTemplate("blank")}
                    >
                      <div className="blank-template">
                        <Plus size={25} />
                        <span>A fresh start</span>
                      </div>
                      <div className="template-label">Blank canvas</div>
                      <small>Make space for anything</small>
                    </button>
                  </div>
                  <div className="creative-tip">
                    <span>✳</span>
                    <div>
                      <b>Big ideas start small.</b>
                      <p>
                        Pick a template. Change a color.
                        <br />
                        See where it takes you.
                      </p>
                    </div>
                  </div>
                  <div className="panel-footnote">
                    <ShieldCheck size={14} />
                    Open source. Open possibilities.
                  </div>
                </>
              )}
              {tool === "Elements" && (
                <>
                  <p className="panel-subtitle">
                    The building blocks of something great.
                  </p>
                  <div className="section-label">Shapes & lines</div>
                  <div className="shape-grid">
                    {(
                      [
                        { kind: "rectangle", icon: Square },
                        { kind: "circle", icon: Circle },
                        { kind: "triangle", icon: Triangle },
                        { kind: "star", icon: Star },
                        { kind: "line", icon: Minus },
                      ] as const
                    ).map(({ kind, icon: Icon }) => (
                      <button
                        key={kind}
                        onClick={() => canvas.current?.addShape(kind)}
                      >
                        <Icon size={35} />
                        <span>{kind}</span>
                      </button>
                    ))}
                  </div>
                  <div className="section-label">Composition</div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      canvas.current?.addShape("circle");
                      update({ fill: project.colors[0], scaleX: 2, scaleY: 2 });
                    }}
                  >
                    Add a statement circle <ArrowUpRight size={16} />
                  </Button>
                  <div className="info-card">
                    <MousePointer2 size={22} />
                    <b>A few useful moves</b>
                    <p>
                      Drag to move. Use the corner handles to resize, or the top
                      handle to rotate. Hold Shift and click to select more.
                    </p>
                  </div>
                </>
              )}
              {tool === "Text" && (
                <>
                  <p className="panel-subtitle">
                    Find the right words. Make them stand out.
                  </p>
                  <Button onClick={() => canvas.current?.addText("heading")}>
                    <Plus size={17} />
                    Add a text box
                  </Button>
                  <div className="section-label">Default text styles</div>
                  <div className="text-presets">
                    <button onClick={() => canvas.current?.addText("heading")}>
                      <strong>Add a heading</strong>
                      <span>Something worth saying.</span>
                    </button>
                    <button
                      onClick={() => canvas.current?.addText("subheading")}
                    >
                      <h3>Add a subheading</h3>
                    </button>
                    <button onClick={() => canvas.current?.addText("body")}>
                      <p>Add a little bit of body text</p>
                    </button>
                  </div>
                  <div className="info-card">
                    <Type size={22} />
                    <b>Words with personality</b>
                    <p>
                      Double-click text to edit, then highlight words to change their font, size, color, bold or italic style. Select the box once to format all its text.
                    </p>
                  </div>
                </>
              )}
              {tool === "Uploads" && (
                <>
                  <p className="panel-subtitle">
                    Bring your own point of view.
                  </p>
                  <button
                    className="upload-area"
                    onClick={() => imageInput.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void uploadImages(e.dataTransfer.files);
                    }}
                  >
                    <div>
                      <ImagePlus size={29} />
                    </div>
                    <b>Drop an image here</b>
                    <span>or click to browse your files</span>
                    <small>PNG, JPG, WebP, GIF · up to 8 MB</small>
                  </button>
                  <div className="info-card">
                    <Lock size={21} />
                    <b>Your files stay yours</b>
                    <p>
                      Images are embedded in your design and saved on this
                      device. Export an editable project to keep a backup.
                    </p>
                  </div>
                </>
              )}
              {tool === "Brand" && (
                <>
                  <p className="panel-subtitle">
                    A little consistency goes a long way.
                  </p>
                  <div className="brand-heading">
                    <img className="brand-logo" src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/favicon.svg"} alt="gradesign. icon" />
                    <div>
                      <b>Your brand kit</b>
                      <small>Personal collection</small>
                    </div>
                  </div>
                  <div className="section-label">Brand colors</div>
                  <select aria-label="Apply brand color to" value={brandTarget} onChange={e => setBrandTarget(e.target.value as "selection" | "background")}>
                    <option value="selection">Selected text or element</option>
                    <option value="background">Page background</option>
                  </select>
                  <div className="brand-colors" onPointerDownCapture={() => canvas.current?.captureTextSelection()}>
                    {project.colors.map((c, i) => (
                      <button
                        key={`${c}-${i}`}
                        style={{ background: c }}
                        title={`Apply ${c}`}
                        aria-label={`Apply ${c}`}
                        onClick={() =>
                          brandTarget === "selection" && selection
                            ? update({ fill: c })
                            : brandTarget === "background" ? canvas.current?.setBackground(c) : notify("Select text or an element first.")
                        }
                      />
                    ))}
                  </div>
                  <p className="micro-copy">
                    Click a swatch to apply it. Highlight words to color just part of a text box.
                  </p>
                  <div className="brand-color-manager">
                    {project.colors.map((color, index) => <div className="brand-color-row" key={index}>
                      <input type="color" aria-label={`Edit brand color ${index + 1}`} value={color} onChange={e => setProject({ ...project, colors: project.colors.map((c, i) => i === index ? e.target.value : c) })} />
                      <span>{color.toUpperCase()}</span>
                      <button aria-label={`Remove brand color ${index + 1}`} className="icon-button" onClick={() => setProject({ ...project, colors: project.colors.filter((_, i) => i !== index) })}><Trash2 size={14} /></button>
                    </div>)}
                    <form className="brand-color-row" onSubmit={e => { e.preventDefault(); if (/^#[0-9a-f]{6}$/i.test(paletteColor) && !project.colors.some(c => c.toLowerCase() === paletteColor.toLowerCase()) && project.colors.length < 100) { setProject({ ...project, colors: [...project.colors, paletteColor.toLowerCase()] }); notify("Brand color added"); } }}>
                      <input type="color" aria-label="New brand color" value={/^#[0-9a-f]{6}$/i.test(paletteColor) ? paletteColor : "#2f4bff"} onChange={e => setPaletteColor(e.target.value)} />
                      <input aria-label="New brand color hex" value={paletteColor} maxLength={7} pattern="#[0-9a-fA-F]{6}" onChange={e => setPaletteColor(e.target.value)} />
                      <button type="submit" className="icon-button" aria-label="Add brand color"><Plus size={17} /></button>
                    </form>
                  </div>
                  <FontManager key={project.id} fonts={project.fonts ?? []} disabled={collabEnabled} notify={notify} onAdd={font => {
                    setProject(p => p && p.id === project.id ? { ...p, fonts: [...(p.fonts ?? []), font], updatedAt: new Date().toISOString() } : p);
                    canvas.current?.refreshFonts();
                  }} />
                </>
              )}
              {tool === "Projects" && (
                <>
                  <p className="panel-subtitle">
                    Everything you’re working on, in one place.
                  </p>
                  <div className="project-actions">
                    <Button onClick={() => void newProject()}>
                      <Plus size={16} />
                      New design
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => projectInput.current?.click()}
                    >
                      <Upload size={15} />
                      Import
                    </Button>
                  </div>
                  <div className="section-label">
                    On this device <span>{savedProjects.length} designs</span>
                  </div>
                  <div className="project-list">
                    {savedProjects.map((p) => (
                      <div className="project-row" key={p.id}>
                      <button
                        onClick={() => void openProject(p)}
                        className={p.id === project.id ? "current" : ""}
                      >
                        {p.pages[0].thumbnail ? (
                          <img src={p.pages[0].thumbnail} alt="" />
                        ) : (
                          <div className="project-placeholder">
                            <LayoutTemplate size={24} />
                          </div>
                        )}
                        <div>
                          <b>{p.title.trim() || "Unnamed project"}</b>
                          <small>
                            {p.pages.length} page
                            {p.pages.length !== 1 ? "s" : ""} ·{" "}
                            {new Date(p.updatedAt).toLocaleDateString()}
                          </small>
                        </div>
                        {p.id === project.id && <Check size={16} />}
                      </button>
                      <IconButton icon={Trash2} label={`Delete project ${p.title.trim() || "Unnamed project"}`} disabled={collabEnabled || projectBusy} onClick={() => setDeleteTarget(p)} />
                      </div>
                    ))}
                  </div>
                  <details className="project-trash">
                    <summary>Trash ({trashedProjects.length})</summary>
                    <p className="micro-copy">Deleted designs stay on this device until restored. Cloud copies are unaffected.</p>
                    {trashedProjects.map(p => <div className="trash-row" key={p.id}><span>{p.title.trim() || "Unnamed project"}</span><button className="toolbar-button" disabled={projectBusy} onClick={() => void recoverProject(p.id)} aria-label={`Restore project ${p.title.trim() || "Unnamed project"}`}>Restore</button></div>)}
                    {!trashedProjects.length && <p className="micro-copy">Trash is empty.</p>}
                  </details>
                  <Button
                    variant="secondary"
                    disabled={busy || collabEnabled}
                    onClick={() =>
                      API_URL ? void cloudSave() : setModal("account")
                    }
                  >
                    <Cloud size={16} />
                    Save to workspace
                  </Button>
                  {API_URL && user && (
                    <CloudProjects
                      refreshKey={remoteRevision}
                      onOpen={async (document, id, revision) => {
                        if (await openProject(document)) {
                          setRemoteId(id);
                          setRemoteRevision(revision);
                        }
                      }}
                    />
                  )}
                </>
              )}
            </aside>
          )}
          <main className="main-editor">
            <div className="format-toolbar" onPointerDownCapture={() => canvas.current?.captureTextSelection()}>
              <div className="format-group">
                <IconButton
                  icon={Undo2}
                  label="Undo · Ctrl Z"
                  disabled={!history[0] || collabEnabled}
                  onClick={() => canvas.current?.undo()}
                />
                <IconButton
                  icon={Redo2}
                  label="Redo · Ctrl Shift Z"
                  disabled={!history[1] || collabEnabled}
                  onClick={() => canvas.current?.redo()}
                />
              </div>
              <div className="toolbar-rule" />
              {selection ? (
                <>
                  <ColorPicker value={selection.fill} colors={project.colors} label="Element color" capture={() => canvas.current?.captureTextSelection()} onChange={fill => update({ fill })} />
                  {selection.type.toLowerCase().includes("text") && (
                    <>
                      <select
                        aria-label="Font family"
                        value={selection.fontFamily ?? "Arial"}
                        onChange={(e) => void applyFont(e.target.value)}
                      >
                        {fontOptions(project.fonts).map(f => <option key={f.family} value={f.family}>{f.family}{f.category === "Custom" ? " · Custom" : ""}</option>)}
                        {!fontOptions(project.fonts).some(f => f.family === selection.fontFamily) && <option value={selection.fontFamily}>{selection.fontFamily}</option>}
                      </select>
                      <FontSizeInput key={`${selection.id}-${selection.textSelection?.start}-${selection.textSelection?.end}`} value={selection.fontSize ?? 32} onChange={fontSize => update({ fontSize })} />
                      <IconButton
                        icon={Bold}
                        label="Bold"
                        active={
                          selection.fontWeight === "bold" ||
                          selection.fontWeight === 700
                        }
                        onClick={() =>
                          update({
                            fontWeight:
                              selection.fontWeight === "bold" ||
                              selection.fontWeight === 700
                                ? "normal"
                                : "bold",
                          })
                        }
                      />
                      <IconButton
                        icon={Italic}
                        label="Italic"
                        active={selection.fontStyle === "italic"}
                        onClick={() =>
                          update({
                            fontStyle:
                              selection.fontStyle === "italic"
                                ? "normal"
                                : "italic",
                          })
                        }
                      />
                      <IconButton
                        icon={Underline}
                        label="Underline"
                        active={selection.underline}
                        onClick={() =>
                          update({ underline: !selection.underline })
                        }
                      />
                      <IconButton
                        icon={AlignLeft}
                        label="Align text left"
                        onClick={() => update({ textAlign: "left" })}
                      />
                      <IconButton
                        icon={AlignCenter}
                        label="Align text center"
                        onClick={() => update({ textAlign: "center" })}
                      />
                    </>
                  )}
                  <div className="toolbar-rule" />
                  <IconButton
                    icon={Copy}
                    label="Duplicate · Ctrl D"
                    onClick={() => canvas.current?.duplicateSelection()}
                  />
                  <IconButton
                    icon={selection.locked ? Unlock : Lock}
                    label={selection.locked ? "Unlock" : "Lock"}
                    onClick={() =>
                      canvas.current?.toggleLayer(selection.id, "locked")
                    }
                  />
                  <IconButton
                    icon={Trash2}
                    label="Delete element"
                    onClick={() => canvas.current?.removeSelection()}
                  />
                </>
              ) : (
                <>
                  <ColorPicker value={String(project.pages[pageIndex]?.canvas.background ?? "#ffffff")} colors={project.colors} label="Page background color" onChange={color => canvas.current?.setBackground(color)} />
                  <span className="toolbar-label">Page background</span>
                  <div className="toolbar-rule" />
                  <button
                    className="toolbar-button"
                    onClick={() => {
                      setAnimate(true);
                      setTimeout(() => setAnimate(false), 900);
                    }}
                  >
                    <Sparkles size={16} />
                    Animate preview
                  </button>
                </>
              )}
              <div className="toolbar-spacer" />
              {selection?.textSelection && <span className="text-range-hint" title="Formatting applies to highlighted characters">{selection.textSelection.end - selection.textSelection.start} selected{selection.mixed?.length ? " · Mixed" : ""}</span>}
              <SizePicker width={pageWidth} height={pageHeight} pageCount={project.pages.length} onResize={resizePages} disabled={collabEnabled} />
              <button
                className={`toolbar-button ${grid ? "active" : ""}`}
                onClick={() => setGrid(!grid)}
              >
                <Grid2X2 size={16} />
                <span>Grid</span>
              </button>
              <IconButton
                icon={Layers}
                label="Layers panel"
                active={rightPanel === "layers"}
                onClick={() =>
                  setRightPanel(rightPanel === "layers" ? null : "layers")
                }
              />
              <IconButton
                icon={MessageCircle}
                label="Comments"
                active={rightPanel === "comments"}
                onClick={() =>
                  setRightPanel(rightPanel === "comments" ? null : "comments")
                }
              />
            </div>
            <div
              className={`canvas-stage ${pinMode ? "pin-mode" : ""}`}
              ref={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadImages(e.dataTransfer.files);
              }}
            >
              <div className="canvas-stage-inner" style={{ width: pageWidth * zoom }}>
                <div className="canvas-caption">
                  <span>
                    <b>{String(pageIndex + 1).padStart(2, "0")}</b>
                    <input
                      aria-label="Page name"
                      value={project.pages[pageIndex]?.name ?? ""}
                      onChange={(e) =>
                        setProject({
                          ...project,
                          pages: project.pages.map((p) =>
                            p.id === activePage
                              ? { ...p, name: e.target.value }
                              : p,
                          ),
                        })
                      }
                    />
                  </span>
                  <div>
                    <IconButton
                      icon={Copy}
                      label="Duplicate page"
                      onClick={() => void addPage(true)}
                    />
                    <IconButton
                      icon={Trash2}
                      label="Delete page"
                      disabled={project.pages.length === 1}
                      onClick={() => void deletePage()}
                    />
                  </div>
                </div>
                <div
                  className={`canvas-paper ${animate ? "animate-paper" : ""}`}
                  style={{ width: pageWidth * zoom, height: pageHeight * zoom }}
                  onPointerMove={sendCursor}
                  onPointerLeave={() => {
                    lastCursorSent.current = 0;
                    collaboration.setCursor(null);
                  }}
                >
                  <DesignCanvas
                    ref={canvas}
                    initialJSON={
                      Object.keys(project.pages[0].canvas).length
                        ? project.pages[0].canvas
                        : undefined
                    }
                    onChange={onChange}
                    onSelection={onSelection}
                    onHistoryChange={onHistory}
                    zoom={zoom}
                    grid={grid}
                  />
                  {collabEnabled &&
                    collaboration.peers
                      .filter((peer) => peer.cursor?.pageId === activePage)
                      .map((peer) => (
                        <div
                          key={peer.clientId}
                          aria-label={`${peer.name}\'s cursor`}
                          style={{
                            position: "absolute",
                            left:
                              Math.max(0, Math.min(pageWidth, peer.cursor!.x)) * zoom,
                            top:
                              Math.max(0, Math.min(pageHeight, peer.cursor!.y)) * zoom,
                            zIndex: 25,
                            pointerEvents: "none",
                            color: peer.color,
                          }}
                        >
                          <MousePointer2
                            size={21}
                            fill={peer.color}
                            stroke="white"
                            strokeWidth={1.6}
                          />
                          <span
                            style={{
                              display: "block",
                              marginLeft: 16,
                              marginTop: -3,
                              padding: "3px 7px",
                              borderRadius: 5,
                              background: peer.color,
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 600,
                              whiteSpace: "nowrap",
                              maxWidth: 160,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {peer.name}
                          </span>
                        </div>
                      ))}
                  {rightPanel === "comments" &&
                    project.comments
                      .filter((c) => c.pageId === activePage)
                      .map((c, i) => (
                        <div
                          key={c.id}
                          className="comment-pin"
                          style={{ left: c.x * zoom, top: c.y * zoom }}
                          title={c.text}
                        >
                          {i + 1}
                        </div>
                      ))}
                  {pinMode && (
                    <button
                      aria-label="Click to pin your comment"
                      className="pin-overlay"
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        addComment(
                          (e.clientX - r.left) / zoom,
                          (e.clientY - r.top) / zoom,
                        );
                      }}
                    />
                  )}
                </div>
                <button
                  className="add-page-inline"
                  onClick={() => void addPage()}
                >
                  <Plus size={16} />
                  Add page
                </button>
              </div>
            </div>
            <div className="pages-strip">
              <div className="pages-label">
                <LayoutTemplate size={17} />
                <span>Pages</span>
                <b>{project.pages.length}</b>
              </div>
              <div className="page-thumbnails">
                {project.pages.map((p, i) => (
                  <button
                    key={p.id}
                    className={`page-thumbnail ${p.id === activePage ? "selected" : ""}`}
                    onClick={() => void switchPage(p)}
                  >
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt={`Page ${i + 1}: ${p.name}`} />
                    ) : (
                      <span className="empty-page" />
                    )}
                    <span>{i + 1}</span>
                  </button>
                ))}
                <button
                  className="new-page-tile"
                  aria-label="Add page"
                  onClick={() => void addPage()}
                >
                  <Plus size={19} />
                </button>
              </div>
              <div className="page-order">
                <IconButton
                  icon={ChevronLeft}
                  label="Move page left"
                  disabled={pageIndex === 0}
                  onClick={() => movePage(-1)}
                />
                <IconButton
                  icon={ChevronRight}
                  label="Move page right"
                  disabled={pageIndex === project.pages.length - 1}
                  onClick={() => movePage(1)}
                />
              </div>
            </div>
            <footer className="statusbar">
              <span className="canvas-dimensions">
                {pageWidth} × {pageHeight} px <span>•</span>
                <span>All the space you need.</span>
              </span>
              <div className="zoom-controls">
                <IconButton
                  icon={Minus}
                  label="Zoom out"
                  onClick={() => setZoom(Math.max(0.05, zoom - 0.1))}
                />
                <input
                  type="range"
                  aria-label="Canvas zoom"
                  min="5"
                  max="130"
                  value={zoom * 100}
                  onChange={(e) => setZoom(Number(e.target.value) / 100)}
                />
                <IconButton
                  icon={Plus}
                  label="Zoom in"
                  onClick={() => setZoom(Math.min(1.3, zoom + 0.1))}
                />
                <button className="zoom-percent" onClick={() => setZoom(fit)}>
                  {Math.round(zoom * 100)}%
                </button>
                <IconButton
                  icon={Maximize2}
                  label="Fit canvas to screen"
                  onClick={() => setZoom(fit)}
                />
              </div>
            </footer>
          </main>
          {rightPanel && (
            <aside className="properties-panel">
              <div className="right-tabs">
                <button
                  className={rightPanel === "layers" ? "selected" : ""}
                  onClick={() => setRightPanel("layers")}
                >
                  Layers
                </button>
                <button
                  className={rightPanel === "comments" ? "selected" : ""}
                  onClick={() => setRightPanel("comments")}
                >
                  Comments{" "}
                  {project.comments.filter((c) => c.pageId === activePage)
                    .length || ""}
                </button>
              </div>
              {rightPanel === "layers" ? (
                <>
                  <div className="layers-caption">
                    <span>ON THIS PAGE</span>
                    <span>{layers.length} elements</span>
                  </div>
                  <div className="layers-list">
                    {layers.map((layer) => (
                      <div
                        key={layer.id}
                        className={`layer-row ${selection?.id === layer.id ? "selected" : ""}`}
                      >
                        <GripVertical size={13} className="grip" />
                        <button
                          className="layer-select"
                          onClick={() => canvas.current?.selectLayer(layer.id)}
                        >
                          <span className="layer-type">
                            {layer.type.toLowerCase().includes("text") ? (
                              <Type size={15} />
                            ) : layer.type.toLowerCase().includes("image") ? (
                              <FileImage size={15} />
                            ) : (
                              <Square size={15} />
                            )}
                          </span>
                          <span
                            onDoubleClick={() => {
                              const name = window.prompt(
                                "Layer name",
                                layer.name,
                              );
                              if (name)
                                canvas.current?.renameLayer(layer.id, name);
                            }}
                          >
                            {layer.name}
                          </span>
                        </button>
                        <button
                          aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                          onClick={() =>
                            canvas.current?.toggleLayer(layer.id, "visible")
                          }
                        >
                          {layer.visible ? (
                            <Eye size={13} />
                          ) : (
                            <EyeOff size={13} />
                          )}
                        </button>
                        <button
                          aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
                          onClick={() =>
                            canvas.current?.toggleLayer(layer.id, "locked")
                          }
                        >
                          {layer.locked ? (
                            <Lock size={13} />
                          ) : (
                            <Unlock size={13} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="layer-actions">
                    <IconButton
                      icon={ArrowUp}
                      label="Bring element forward"
                      disabled={!selection}
                      onClick={() =>
                        selection &&
                        canvas.current?.moveLayer(selection.id, "up")
                      }
                    />
                    <IconButton
                      icon={ArrowDown}
                      label="Send element backward"
                      disabled={!selection}
                      onClick={() =>
                        selection &&
                        canvas.current?.moveLayer(selection.id, "down")
                      }
                    />
                    <IconButton
                      icon={Group}
                      label="Group selected elements"
                      onClick={() => canvas.current?.group()}
                    />
                    <button
                      className="text-button"
                      onClick={() => canvas.current?.ungroup()}
                    >
                      Ungroup
                    </button>
                  </div>
                  <div className="properties-section">
                    <div className="section-label">Position</div>
                    <div className="alignment-buttons">
                      <IconButton
                        icon={AlignLeft}
                        label="Align element left"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("left")}
                      />
                      <IconButton
                        icon={AlignCenter}
                        label="Center element horizontally"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("center")}
                      />
                      <IconButton
                        icon={AlignRight}
                        label="Align element right"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("right")}
                      />
                      <IconButton
                        icon={ArrowUp}
                        label="Align element top"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("top")}
                      />
                      <IconButton
                        icon={ChevronsUpDown}
                        label="Center element vertically"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("middle")}
                      />
                      <IconButton
                        icon={ArrowDown}
                        label="Align element bottom"
                        disabled={!selection}
                        onClick={() => canvas.current?.align("bottom")}
                      />
                    </div>
                    <div className="property-fields">
                      <label>
                        Opacity
                        <div>
                          <input
                            type="number"
                            aria-label="Element opacity"
                            disabled={!selection}
                            min="0"
                            max="100"
                            value={Math.round((selection?.opacity ?? 1) * 100)}
                            onChange={(e) =>
                              update({
                                opacity: Math.min(
                                  1,
                                  Math.max(0, Number(e.target.value) / 100),
                                ),
                              })
                            }
                          />
                          <span>%</span>
                        </div>
                      </label>
                      <label>
                        Rotation
                        <div>
                          <input
                            type="number"
                            aria-label="Element rotation"
                            disabled={!selection}
                            value={Math.round(selection?.angle ?? 0)}
                            onChange={(e) =>
                              update({ angle: Number(e.target.value) })
                            }
                          />
                          <span>°</span>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div className="layer-tip">
                    <MousePointer2 size={15} />
                    <p>
                      {selection
                        ? "Double-click a layer name to rename it."
                        : "Select an element on the canvas to make it your own."}
                    </p>
                  </div>
                </>
              ) : (
                <div className="comments-panel">
                  <p className="panel-subtitle">
                    Leave a thought, right where it belongs.
                  </p>
                  {project.comments
                    .filter((c) => c.pageId === activePage)
                    .map((c, i) => (
                      <div className="comment-card" key={c.id}>
                        <div>
                          <span className="comment-number">{i + 1}</span>
                          <b>You</b>
                          <button
                            aria-label="Delete comment"
                            onClick={() =>
                              setProject({
                                ...project,
                                comments: project.comments.filter(
                                  (x) => x.id !== c.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <p>{c.text}</p>
                        <small>
                          {new Date(c.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                    ))}
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add your thoughts…"
                    aria-label="Comment text"
                  />
                  <Button
                    disabled={!comment.trim()}
                    onClick={() => {
                      setPinMode(true);
                      notify("Click on the canvas to place your comment.");
                    }}
                  >
                    <MessageCircle size={15} />
                    {pinMode ? "Click canvas to pin" : "Pin a comment"}
                  </Button>
                  <p className="micro-copy">
                    Comments are saved with this local project.
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>
        {presentation && (
          <div className="presentation-controls">
            <Button
              variant="secondary"
              disabled={pageIndex === 0}
              onClick={() => void switchPage(project.pages[pageIndex - 1])}
            >
              <ChevronLeft size={18} />
            </Button>
            <span>
              {pageIndex + 1} / {project.pages.length}
            </span>
            <Button
              variant="secondary"
              disabled={pageIndex === project.pages.length - 1}
              onClick={() => void switchPage(project.pages[pageIndex + 1])}
            >
              <ChevronRight size={18} />
            </Button>
            <Button onClick={() => setPresentation(false)}>
              <X size={16} />
              Exit presentation
            </Button>
          </div>
        )}
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => {
            void uploadImages(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={projectInput}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            void importProject(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Dialog.Root
          open={modal !== null}
          onOpenChange={(open) => {
            if (!open) setModal(null);
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay" />
            <Dialog.Content className="dialog-content">
              <Dialog.Close className="dialog-close" aria-label="Close dialog">
                <X size={20} />
              </Dialog.Close>
              <div className="dialog-symbol">
                {modal === "export" ? (
                  <Download size={25} />
                ) : modal === "account" ? (
                  <User size={25} />
                ) : modal === "help" ? (
                  <Sparkles size={25} />
                ) : (
                  <Users size={25} />
                )}
              </div>
              <Dialog.Title>
                {modal === "export"
                  ? "Good things are made to be shared."
                  : modal === "account"
                    ? user
                      ? "Your workspace"
                      : "A space for your ideas."
                    : modal === "help"
                      ? "A little help goes a long way."
                      : "Your next big idea. Out in the world."}
              </Dialog.Title>
              <Dialog.Description>
                {modal === "export"
                  ? "Choose the perfect format for your design."
                  : modal === "account"
                    ? "Create, save, and keep everything together."
                    : modal === "help"
                      ? "A few shortcuts to keep your creativity flowing."
                      : "Export your creation or save it to a connected workspace."}
              </Dialog.Description>
              {modal === "export" && (
                <div className="dialog-form">
                  <label>
                    File type
                    <select
                      value={exportFormat}
                      onChange={(e) => setExportFormat(e.target.value)}
                    >
                      <option value="png">PNG — crisp images, anywhere</option>
                      <option value="jpeg">
                        JPG — smaller files, easy sharing
                      </option>
                      <option value="pdf">
                        PDF — presentations and printing
                      </option>
                      <option value="svg">SVG — scalable vector design</option>
                      <option value="json">
                        gradesign. project — keep editing later
                      </option>
                    </select>
                  </label>
                  {!["svg", "json"].includes(exportFormat) && (
                    <label>
                      Resolution
                      <select
                        value={exportScale}
                        onChange={(e) => setExportScale(e.target.value)}
                      >
                        {[1, 2, 3].map(scale => <option key={scale} value={scale}>{scale}× · {pageWidth * scale} × {pageHeight * scale} px</option>)}
                      </select>
                    </label>
                  )}
                  {exportFormat === "pdf" && (
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={exportAll}
                        onChange={(e) => setExportAll(e.target.checked)}
                      />
                      Include all {project.pages.length} pages
                    </label>
                  )}
                  <p className="micro-copy">
                    {exportFormat === "json"
                      ? "Includes every page, embedded image, custom font, brand color, and comment."
                      : exportFormat === "pdf"
                        ? "PDF uses high-resolution page images. SVG preserves editable vectors."
                        : "Exports the current page."}
                  </p>
                  <Button disabled={busy} onClick={() => void exportDesign()}>
                    {busy ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <Download size={17} />
                    )}
                    Download {exportFormat.toUpperCase()}
                  </Button>
                </div>
              )}
              {modal === "share" && (
                <div className="dialog-form">
                  <div className="share-design">
                    <div>
                      {project.pages[pageIndex].thumbnail && (
                        <img
                          alt="Current design"
                          src={project.pages[pageIndex].thumbnail}
                        />
                      )}
                    </div>
                    <span>
                      <b>{project.title}</b>
                      <small>
                        {project.pages.length} page
                        {project.pages.length === 1 ? "" : "s"} · {pageWidth} × {pageHeight} px
                      </small>
                    </span>
                  </div>
                  <Button onClick={() => setModal("export")}>
                    <Download size={17} />
                    Download your design
                    <ArrowRight size={17} />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      downloadFile(
                        new Blob([JSON.stringify(project, null, 2)], {
                          type: "application/json",
                        }),
                        "design.gradesign.json",
                      );
                      notify("Editable project exported");
                    }}
                  >
                    <FileJson size={17} />
                    Share an editable project file
                  </Button>
                  {COLLAB_URL && (
                    <>
                      <div className="dialog-divider" />
                      <div className="section-label">
                        <Users size={15} />
                        Live editing
                      </div>
                      <p className="micro-copy">
                        {collabEnabled
                          ? "Changes to pages and elements are shared live. Local undo and workspace snapshots are paused."
                          : "Join a shared room to edit pages and elements together. Existing room content becomes the current design."}
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void toggleCollaboration()}
                      >
                        <Users size={16} />
                        {busy
                          ? "Preparing your room…"
                          : collabEnabled
                            ? "Leave live editing"
                            : API_URL && !user
                              ? "Sign in to edit together"
                              : "Start live editing"}
                      </Button>
                      {collabEnabled && (
                        <>
                          <p className="micro-copy" role="status">
                            {collaboration.status === "connected"
                              ? "Connected · " +
                                (collaboration.peers.length + 1) +
                                " participant" +
                                (collaboration.peers.length ? "s" : "")
                              : collaboration.status === "error"
                                ? "Could not connect. Leave the room and try again after checking your server and access."
                                : "Connecting to the room…"}
                          </p>
                          <label>
                            Room ID
                            <input
                              aria-label="Live editing room ID"
                              readOnly
                              value={API_URL ? remoteId : project.id}
                            />
                          </label>
                        </>
                      )}
                      {!API_URL && (
                        <p className="micro-copy">
                          Open this design in another tab on this device to join
                          the same room. The local collaboration server must be
                          running.
                        </p>
                      )}
                      <p className="micro-copy">
                        Keep an exported project as a backup. Live rooms use
                        separate storage; leave live editing before saving a
                        workspace snapshot.
                      </p>
                    </>
                  )}
                  <div className="dialog-divider" />
                  <div className="section-label">
                    <Cloud size={15} />
                    Connected workspace
                  </div>
                  {API_URL ? (
                    <>
                      <Button
                        variant="secondary"
                        disabled={busy || collabEnabled}
                        onClick={() => void createShare()}
                      >
                        <Link size={16} />
                        {collabEnabled
                          ? "Leave live editing to create a view link"
                          : user
                            ? "Create a view-only link"
                            : "Sign in to share online"}
                      </Button>
                      {shareUrl && (
                        <div className="copy-link">
                          <input
                            value={shareUrl}
                            readOnly
                            aria-label="Share URL"
                          />
                          <IconButton
                            icon={Copy}
                            label="Copy share link"
                            onClick={() =>
                              navigator.clipboard
                                .writeText(shareUrl)
                                .then(() => notify("Link copied"))
                                .catch(() =>
                                  notify(
                                    "Select the link and copy it manually.",
                                  ),
                                )
                            }
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="micro-copy">
                      Your designs are saved on this device. Export an editable
                      project file to share a copy or keep a backup.
                    </p>
                  )}
                </div>
              )}
              {modal === "account" &&
                (user ? (
                  <div className="dialog-form">
                    <p>
                      Signed in as <b>{user.name}</b>
                      <br />
                      {user.email}
                    </p>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        await api("/api/auth/logout", { method: "POST" });
                        leaveCollaboration();
                        setUser(null);
                        setWorkspaceId("");
                        setRemoteId("");
                        setModal(null);
                      }}
                    >
                      Sign out
                    </Button>
                  </div>
                ) : API_URL ? (
                  <form className="dialog-form" onSubmit={auth}>
                    <div className="auth-tabs">
                      <button
                        type="button"
                        className={authMode === "signup" ? "selected" : ""}
                        onClick={() => setAuthMode("signup")}
                      >
                        Create account
                      </button>
                      <button
                        type="button"
                        className={authMode === "login" ? "selected" : ""}
                        onClick={() => setAuthMode("login")}
                      >
                        Sign in
                      </button>
                    </div>
                    {authMode === "signup" && (
                      <label>
                        Your name
                        <input
                          name="name"
                          required
                          minLength={2}
                          autoComplete="name"
                        />
                      </label>
                    )}
                    <label>
                      Email address
                      <input
                        name="email"
                        required
                        type="email"
                        autoComplete="email"
                      />
                    </label>
                    <label>
                      Password
                      <input
                        name="password"
                        required
                        minLength={12}
                        type="password"
                        autoComplete={
                          authMode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                      />
                    </label>
                    {authError && <p className="form-error">{authError}</p>}
                    <Button disabled={busy}>
                      {busy
                        ? "Just a moment…"
                        : authMode === "signup"
                          ? "Create your workspace"
                          : "Welcome back"}
                    </Button>
                  </form>
                ) : (
                  <div className="dialog-form">
                    <div className="info-card">
                      <Cloud size={23} />
                      <b>You’re in the local studio</b>
                      <p>
                        Your designs save automatically in this browser.
                        Export an editable project file to keep a backup or
                        open it on another device.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setModal(null);
                        setTool("Projects");
                      }}
                    >
                      Explore your projects <ArrowRight size={17} />
                    </Button>
                  </div>
                ))}
              {modal === "help" && (
                <div className="dialog-form">
                  <div className="shortcut-list">
                    {[
                      ["Undo", "Ctrl / ⌘ Z"],
                      ["Redo", "Ctrl / ⌘ Shift Z"],
                      ["Copy & paste", "Ctrl / ⌘ C, V"],
                      ["Duplicate", "Ctrl / ⌘ D"],
                      ["Group", "Ctrl / ⌘ G"],
                      ["Ungroup", "Ctrl / ⌘ Shift G"],
                      ["Delete selected", "Delete / Backspace"],
                      ["Edit text", "Double-click text"],
                    ].map(([label, key]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <kbd>{key}</kbd>
                      </div>
                    ))}
                  </div>
                  <p className="micro-copy">
                    gradesign. is an MIT-licensed design studio. Local editing, layers,
                    templates, comments, and exports work here. OAuth, AI tools,
                    video export, and production collaboration require further
                    integration.
                  </p>
                </div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <Dialog.Root open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !projectBusy) setDeleteTarget(null); }}>
          <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content">
            <Dialog.Title>Delete project?</Dialog.Title>
            <Dialog.Description>“{deleteTarget?.title.trim() || "Unnamed project"}” will move to Trash on this device. You can restore it from Projects. Any cloud copy stays unchanged.</Dialog.Description>
            <div className="delete-project-actions">
              <Button variant="secondary" disabled={projectBusy} onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button disabled={projectBusy} onClick={() => void removeProject()}>{projectBusy ? "Moving…" : "Move to Trash"}</Button>
            </div>
          </Dialog.Content></Dialog.Portal>
        </Dialog.Root>
        {toast && (
          <div className="toast" role="status">
            <Check size={17} />
            {toast}
            <button
              onClick={() => setToast("")}
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

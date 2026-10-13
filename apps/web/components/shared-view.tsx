"use client";

import { useEffect, useRef, useState } from "react";
import type { StaticCanvas } from "fabric";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileJson,
  LoaderCircle,
  LockKeyhole,
} from "lucide-react";
import { API_URL, downloadFile, isProject, type Project } from "@/lib/project";
import { validateCanvasJSON } from "@/lib/canvas-types";
import { getCanvasSize } from "@/lib/document-size";
import { ensureFontsForCanvas } from "@/lib/fonts";
import { Button } from "./ui/button";
import styles from "./shared-view.module.css";

type SharedResponse = {
  design: {
    id: string;
    title: string;
    document: unknown;
    revision: number;
    updatedAt: string;
  };
  permission: "view" | "edit";
  expiresAt: string;
};

export function validProject(value: unknown): value is Project {
  try {
    return isProject(value);
  } catch {
    return false;
  }
}

function filename(title: string) {
  return (
    title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "gradesign-design"
  );
}

function previewSize(json: Record<string, unknown>) {
  try {
    return getCanvasSize(json);
  } catch {
    // The render validation below presents invalid dimensions as a page error.
    return getCanvasSize(undefined);
  }
}

export function ReadOnlyProject({
  project,
  title,
  allowCopy = false,
  onClose,
}: {
  project: Project;
  title: string;
  allowCopy?: boolean;
  onClose?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<StaticCanvas | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [exportError, setExportError] = useState("");
  const page = project.pages[pageIndex] ?? project.pages[0];
  const size = previewSize(page.canvas);

  useEffect(() => {
    setPageIndex(0);
  }, [project.id]);
  useEffect(() => {
    const controller = new AbortController();
    const element = document.createElement("canvas");
    element.setAttribute("role", "img");
    element.setAttribute(
      "aria-label",
      `${page.name}, page ${pageIndex + 1} of ${project.pages.length}`,
    );
    let instance: StaticCanvas | null = null;
    let disposed = false;
    host.current?.replaceChildren(element);
    setRendering(true);
    setRenderError("");
    setExportError("");
    const render = async () => {
      try {
        const safeJSON = validateCanvasJSON(
          page.canvas,
          window.location.origin,
        );
        const { StaticCanvas: FabricStaticCanvas } = await import("fabric");
        await ensureFontsForCanvas(safeJSON, project.fonts);
        if (disposed) return;
        instance = new FabricStaticCanvas(element, {
          width: size.width,
          height: size.height,
          renderOnAddRemove: false,
          backgroundColor: "#ffffff",
        });
        await instance.loadFromJSON(safeJSON, undefined, {
          signal: controller.signal,
        });
        if (disposed) return;
        await document.fonts.ready;
        if (disposed) return;
        instance.setDimensions(size);
        instance.renderAll();
        element.style.width = "100%";
        element.style.height = "auto";
        canvas.current = instance;
        setRendering(false);
      } catch (error) {
        if (disposed) return;
        setRenderError(
          error instanceof Error
            ? error.message
            : "This page could not be displayed.",
        );
        setRendering(false);
      }
    };
    void render();
    return () => {
      disposed = true;
      controller.abort();
      if (canvas.current === instance) canvas.current = null;
      if (instance) void instance.dispose().catch(() => undefined);
      element.remove();
    };
  }, [page, pageIndex, project.pages.length, project.fonts, size.width, size.height]);

  const exportPage = () => {
    if (!canvas.current || rendering || renderError) return;
    try {
      downloadFile(
        canvas.current.toDataURL({ format: "png", multiplier: 2 }),
        `${filename(title)}-page-${pageIndex + 1}.png`,
      );
      setExportError("");
    } catch {
      setExportError(
        "An image on this page prevents downloading. Ask the owner to upload that image directly.",
      );
    }
  };

  const changePage = (offset: number) => {
    setRendering(true);
    setPageIndex((value) =>
      Math.max(0, Math.min(project.pages.length - 1, value + offset)),
    );
  };

  const downloadCopy = () => {
    const copy: Project = {
      ...project,
      id: crypto.randomUUID(),
      title: `${title} (copy)`,
      updatedAt: new Date().toISOString(),
    };
    downloadFile(
      new Blob([JSON.stringify(copy, null, 2)], { type: "application/json" }),
      `${filename(title)}.gradesign.json`,
    );
  };

  return (
    <section className={styles.viewer} aria-label="Read-only design preview">
      <header className={styles.header}>
        {onClose ? (
          <button onClick={onClose} className={styles.back}>
            <ArrowLeft size={16} /> Back to projects
          </button>
        ) : (
          <a href="./" className={styles.brand} aria-label="Open gradesign. workspace">
            <img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/logo.svg"} alt="gradesign." className="brand-wordmark" />
          </a>
        )}
        <div className={styles.heading}>
          <h1>{title}</h1>
          <span>
            <Eye size={13} /> View-only preview
          </span>
        </div>
        <div className={styles.actions}>
          {allowCopy && (
            <Button variant="secondary" onClick={downloadCopy}>
              <FileJson size={15} /> Download a copy
            </Button>
          )}
          <Button
            onClick={exportPage}
            disabled={rendering || Boolean(renderError)}
          >
            <Download size={15} /> Download PNG
          </Button>
        </div>
      </header>
      {allowCopy && (
        <p className={styles.notice}>
          This edit link opens a view-only preview. Download a copy and import
          it into your workspace to make your own version.
        </p>
      )}
      <div className={styles.stage}>
        <div className={styles.pageLabel}>
          <span>{page.name}</span>
          <span>
            {size.width} × {size.height} px
          </span>
        </div>
        <div className={styles.paper} style={{ aspectRatio: `${size.width} / ${size.height}` }}>
          <div ref={host} className={styles.canvas} />
          {rendering && (
            <div className={styles.canvasState} role="status">
              <LoaderCircle className="spin" size={22} />
              <span>Preparing this page…</span>
            </div>
          )}
          {renderError && (
            <div className={styles.canvasState} role="alert">
              <LockKeyhole size={24} />
              <p>{renderError}</p>
            </div>
          )}
        </div>
        {exportError && (
          <p className={styles.error} role="alert">
            {exportError}
          </p>
        )}
        <div className={styles.pageNavigation} aria-label="Page navigation">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Previous page"
            onClick={() => changePage(-1)}
            disabled={pageIndex === 0}
          >
            <ChevronLeft size={18} />
          </Button>
          <span aria-live="polite">
            Page {pageIndex + 1} of {project.pages.length}
          </span>
          <Button
            variant="secondary"
            size="icon"
            aria-label="Next page"
            onClick={() => changePage(1)}
            disabled={pageIndex >= project.pages.length - 1}
          >
            <ChevronRight size={18} />
          </Button>
        </div>
      </div>
      <footer className={styles.footer}>
        <LockKeyhole size={13} /> You are viewing a shared design. Changes
        cannot be made in this preview.
      </footer>
    </section>
  );
}

export default function SharedView({ token }: { token: string }) {
  const [result, setResult] = useState<SharedResponse | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError("");
    const load = async () => {
      try {
        if (!/^[A-Za-z0-9_-]{43}$/.test(token))
          throw new Error("This share link is incomplete or invalid.");
        if (!API_URL)
          throw new Error(
            "Shared designs are unavailable until this studio is connected to its cloud workspace.",
          );
        const response = await fetch(
          `${API_URL}/api/shares/${encodeURIComponent(token)}`,
          {
            signal: controller.signal,
            credentials: "omit",
            referrerPolicy: "no-referrer",
          },
        );
        const body = (await response.json()) as SharedResponse & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "This link has expired, was revoked, or cannot be found. Ask the owner for a new link."
              : body.error || "The shared design could not be loaded.",
          );
        if (!body.design || !validProject(body.design.document))
          throw new Error(
            "This shared document is not a supported gradesign. design.",
          );
        if (!controller.signal.aborted) setResult(body);
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "The shared design could not be loaded.",
          );
      }
    };
    void load();
    return () => controller.abort();
  }, [token, attempt]);

  if (result && validProject(result.design.document))
    return (
      <ReadOnlyProject
        key={result.design.id}
        project={result.design.document}
        title={result.design.title}
        allowCopy={result.permission === "edit"}
      />
    );
  return (
    <main className={styles.empty}>
      <a className={styles.brand} href="./" aria-label="Open gradesign. workspace">
        <img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/logo.svg"} alt="gradesign." className="brand-wordmark" />
      </a>
      {error ? (
        <div className={styles.message} role="alert">
          <LockKeyhole size={30} />
          <h1>This design is unavailable</h1>
          <p>{error}</p>
          <Button
            variant="secondary"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Try again
          </Button>
          <a href="./" className={styles.back}>
            <ArrowLeft size={14} /> Open your workspace
          </a>
        </div>
      ) : (
        <div className={styles.message} role="status">
          <LoaderCircle className="spin" size={26} />
          <h1>Opening your shared design</h1>
          <p>A little inspiration is on its way.</p>
        </div>
      )}
    </main>
  );
}

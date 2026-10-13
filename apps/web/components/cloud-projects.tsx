"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Cloud, FolderOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { API_URL, api, type Project } from "@/lib/project";
import { Button } from "./ui/button";
import { ReadOnlyProject, validProject } from "./shared-view";
import styles from "./cloud-projects.module.css";

type CloudDesign = {
  id: string;
  title: string;
  workspaceId: string;
  revision: number;
  updatedAt: string;
};
type Listing = { designs: CloudDesign[]; nextCursor: string | null };
type LoadedDesign = {
  design: CloudDesign & { document: unknown };
  permission: "edit" | "view";
};

export type CloudProjectsProps = {
  onOpen: (
    document: Project,
    id: string,
    revision: number,
  ) => void | Promise<void>;
  refreshKey?: string | number;
};

export default function CloudProjects({
  onOpen,
  refreshKey,
}: CloudProjectsProps) {
  const [designs, setDesigns] = useState<CloudDesign[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [preview, setPreview] = useState<{
    project: Project;
    title: string;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);

  const loadList = useCallback(async (nextCursor?: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setOpening(null);
    setError("");
    try {
      const result = await api<Listing>(
        `/api/designs${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !mounted.current) return;
      if (!Array.isArray(result.designs))
        throw new Error("Your workspace returned an unsupported project list.");
      setDesigns((current) =>
        nextCursor
          ? [
              ...current,
              ...result.designs.filter(
                (item) => !current.some((existing) => existing.id === item.id),
              ),
            ]
          : result.designs,
      );
      setCursor(result.nextCursor);
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Cloud projects could not be loaded.",
        );
    } finally {
      if (!controller.signal.aborted && mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (API_URL) void loadList();
    return () => pending.current?.abort();
  }, [loadList, reload, refreshKey]);

  const openDesign = async (id: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setOpening(id);
    setLoading(false);
    setError("");
    try {
      const response = await api<LoadedDesign>(
        `/api/designs/${encodeURIComponent(id)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || !mounted.current) return;
      if (!validProject(response.design.document))
        throw new Error(
          "This cloud document is not a supported gradesign. project.",
        );
      const project = {
        ...response.design.document,
        title: response.design.title,
      };
      if (response.permission === "view")
        setPreview({ project, title: response.design.title });
      else await onOpen(project, response.design.id, response.design.revision);
    } catch (reason) {
      if (!controller.signal.aborted && mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "This cloud project could not be opened.",
        );
    } finally {
      if (mounted.current && !controller.signal.aborted) setOpening(null);
    }
  };

  if (!API_URL)
    return (
      <div className={styles.empty}>
        <Cloud size={20} />
        <p>Connect a cloud workspace to access projects across your devices.</p>
      </div>
    );

  return (
    <section className={styles.cloudProjects} aria-label="Cloud projects">
      <div className={styles.heading}>
        <span>
          <Cloud size={14} /> In your workspace
        </span>
        <button
          onClick={() => setReload((value) => value + 1)}
          disabled={loading || Boolean(opening)}
          aria-label="Refresh cloud projects"
        >
          <RefreshCw size={14} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button onClick={() => setReload((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {loading && designs.length === 0 && (
        <div
          className={styles.skeletons}
          role="status"
          aria-label="Loading cloud projects"
        >
          <div />
          <div />
          <div />
        </div>
      )}
      {!loading && !error && designs.length === 0 && (
        <div className={styles.empty}>
          <FolderOpen size={22} />
          <p>
            No cloud projects yet. Save a design to your workspace to find it
            here.
          </p>
        </div>
      )}
      <div className={styles.list}>
        {designs.map((design) => (
          <button
            key={design.id}
            onClick={() => void openDesign(design.id)}
            disabled={Boolean(opening)}
            aria-label={`Open cloud project ${design.title}`}
          >
            <span className={styles.symbol}>
              {opening === design.id ? (
                <LoaderCircle size={19} className="spin" />
              ) : (
                <Cloud size={19} />
              )}
            </span>
            <span className={styles.details}>
              <b>{design.title}</b>
              <small>
                {Number.isNaN(Date.parse(design.updatedAt))
                  ? "Saved to workspace"
                  : new Date(design.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}{" "}
                · Cloud project
              </small>
            </span>
          </button>
        ))}
      </div>
      {cursor && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void loadList(cursor)}
          disabled={loading || Boolean(opening)}
        >
          {loading ? <LoaderCircle size={13} className="spin" /> : null} Load
          more
        </Button>
      )}
      <Dialog.Root
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.previewOverlay} />
          <Dialog.Content className={styles.previewDialog}>
            <Dialog.Title className={styles.srOnly}>
              View cloud design
            </Dialog.Title>
            <Dialog.Description className={styles.srOnly}>
              Your workspace role allows viewing this design. Browse pages and
              download a PNG.
            </Dialog.Description>
            {preview && (
              <ReadOnlyProject
                project={preview.project}
                title={preview.title}
                onClose={() => setPreview(null)}
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}

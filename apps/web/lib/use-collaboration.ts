"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import {
  applyPageChanges,
  readPages,
  observeRemotePages,
  applyFontChanges,
  readFonts,
  observeRemoteFonts,
  LOCAL_ORIGIN,
  type CollaborativePage,
} from "@forma/collaboration";
import { validateCustomFontCollection, type CustomFont } from "./fonts";

export type CollaborationStatus =
  | "disabled"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
export type Cursor = { pageId: string; x: number; y: number };
export type Peer = {
  clientId: number;
  name: string;
  color: string;
  cursor: Cursor | null;
};

type Options = {
  enabled: boolean;
  roomId: string;
  user: { name: string; color: string };
  initialPages: CollaborativePage[];
  onRemotePages: (pages: CollaborativePage[]) => void;
  initialFonts?: CustomFont[];
  onRemoteFonts?: (fonts: CustomFont[]) => void;
  getToken?: () => Promise<string>;
  serverUrl?: string;
};

/** Opt-in Yjs transport. The default editor remains local until configured. */
export function useCollaboration(options: Options) {
  const serverUrl = options.serverUrl ?? process.env.NEXT_PUBLIC_COLLAB_URL;
  const [status, setStatus] = useState<CollaborationStatus>("disabled");
  const [peers, setPeers] = useState<Peer[]>([]);
  const latest = useRef(options);
  latest.current = options;
  const current = useRef<{
    doc: Y.Doc;
    provider: WebsocketProvider;
    ready: boolean;
  } | null>(null);
  const baseline = useRef<CollaborativePage[]>([]);
  const fontBaseline = useRef<CustomFont[]>([]);

  useEffect(() => {
    if (!options.enabled || !serverUrl) {
      setStatus("disabled");
      setPeers([]);
      return;
    }
    let disposed = false;
    let removeObserver: (() => void) | undefined;
    let removeFontObserver: (() => void) | undefined;
    let provider: WebsocketProvider | undefined;
    let doc: Y.Doc | undefined;
    let refreshing = false;
    let invalidRemoteData = false;
    setStatus("connecting");
    async function connect() {
      try {
        const token = await latest.current.getToken?.();
        if (disposed) return;
        doc = new Y.Doc();
        provider = new WebsocketProvider(serverUrl!, options.roomId, doc, {
          connect: false,
          params: token ? { token } : {},
          // Cross-tab sync bypasses server authentication. Keep it disabled
          // so every participant must pass the websocket authorization gate.
          disableBc: true,
        });
        const session = { doc, provider, ready: false };
        current.current = session;
        baseline.current = [];
        fontBaseline.current = [];
        function receiveFonts(force = false): boolean {
          const fonts = readFonts(session.doc);
          if (!validateCustomFontCollection(fonts)) {
            invalidRemoteData = true;
            session.ready = false;
            session.provider.disconnect();
            setStatus("error");
            return false;
          }
          const previous = fontBaseline.current;
          if (force || fonts.length !== previous.length || fonts.some((font, index) => {
            const old = previous[index];
            return !old || Object.keys(font).some((key) => font[key as keyof CustomFont] !== old[key as keyof CustomFont]);
          })) {
            fontBaseline.current = fonts;
            latest.current.onRemoteFonts?.(fonts);
          }
          return true;
        }
        removeObserver = observeRemotePages(doc, (pages) => {
          if (!session.ready || disposed) return;
          // Fonts from this update must reach the editor before page measurement.
          if (!receiveFonts()) return;
          baseline.current = pages;
          latest.current.onRemotePages(pages);
        });
        removeFontObserver = observeRemoteFonts(doc, () => {
          if (session.ready && !disposed) receiveFonts();
        });
        provider.on("sync", (synced: boolean) => {
          if (!synced || disposed) return;
          if (!session.ready) {
            const pages = readPages(session.doc);
            if (pages.length === 0) {
              const fonts = latest.current.initialFonts ?? [];
              if (!validateCustomFontCollection(fonts)) { invalidRemoteData = true; session.provider.disconnect(); setStatus("error"); return; }
              session.doc.transact(() => {
                applyFontChanges(session.doc, [], fonts);
                applyPageChanges(session.doc, [], latest.current.initialPages);
              }, LOCAL_ORIGIN);
              baseline.current = structuredClone(latest.current.initialPages);
              fontBaseline.current = structuredClone(fonts);
            } else {
              // Always replace joining client's font metadata, including an empty
              // remote collection, before dispatching any remote page snapshot.
              if (!receiveFonts(true)) return;
              baseline.current = pages;
              latest.current.onRemotePages(pages);
            }
            session.ready = true;
          }
          setStatus("connected");
        });
        provider.on("status", ({ status: value }: { status: string }) => {
          if (!disposed)
            setStatus(
              value === "connected"
                ? session.ready
                  ? "connected"
                  : "connecting"
                : value === "connecting"
                  ? "connecting"
                  : "disconnected",
            );
        });
        provider.on("connection-close", async () => {
          // Refresh after network failures too: the old token might expire
          // while offline, in which case there is no 4001 close frame.
          if (disposed || invalidRemoteData || refreshing || !latest.current.getToken) return;
          refreshing = true;
          session.provider.disconnect();
          try {
            const renewed = await latest.current.getToken();
            if (!disposed) {
              session.provider.params = { token: renewed };
              session.provider.connect();
            }
          } catch {
            if (!disposed) setStatus("error");
          } finally {
            refreshing = false;
          }
        });
        provider.awareness.setLocalStateField("user", latest.current.user);
        provider.awareness.setLocalStateField("cursor", null);
        provider.awareness.on("change", () => {
          if (disposed) return;
          setPeers(
            Array.from(session.provider.awareness.getStates().entries())
              .filter(([id]) => id !== session.doc.clientID)
              .map(([clientId, state]) => ({
                clientId,
                name:
                  typeof state.user?.name === "string"
                    ? state.user.name.slice(0, 80)
                    : "Collaborator",
                color: /^#[0-9a-f]{6}$/i.test(state.user?.color)
                  ? state.user.color
                  : "#8b5cf6",
                cursor:
                  state.cursor &&
                  typeof state.cursor.pageId === "string" &&
                  Number.isFinite(state.cursor.x) &&
                  Number.isFinite(state.cursor.y)
                    ? (state.cursor as Cursor)
                    : null,
              })),
          );
        });
        provider.connect();
      } catch {
        if (!disposed) setStatus("error");
      }
    }
    void connect();
    return () => {
      disposed = true;
      current.current = null;
      removeObserver?.();
      removeFontObserver?.();
      provider?.destroy();
      doc?.destroy();
    };
  }, [options.enabled, options.roomId, serverUrl]);

  const updatePages = useCallback((pages: CollaborativePage[]) => {
    const session = current.current;
    if (!session?.ready) return;
    applyPageChanges(session.doc, baseline.current, pages);
    baseline.current = structuredClone(pages);
  }, []);

  const setCursor = useCallback((cursor: Cursor | null) => {
    current.current?.provider.awareness.setLocalStateField("cursor", cursor);
  }, []);

  const updateFonts = useCallback((fonts: CustomFont[]) => {
    const session = current.current;
    if (!session?.ready) return;
    if (!validateCustomFontCollection(fonts)) throw new Error("This design contains invalid or oversized custom fonts.");
    applyFontChanges(session.doc, fontBaseline.current, fonts);
    fontBaseline.current = structuredClone(fonts);
  }, []);

  return { status, peers, updatePages, updateFonts, setCursor };
}

"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import Studio from "./studio";
import SharedView from "./shared-view";

export default function WorkspaceEntry() {
  const [route, setRoute] = useState<{ share: string | null } | null>(null);
  useEffect(() => {
    const readLocation = () =>
      setRoute({
        share: new URLSearchParams(window.location.search).get("share"),
      });
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);
  if (!route)
    return (
      <div className="boot-screen" role="status">
        <img src={(process.env.NEXT_PUBLIC_BASE_PATH ?? "") + "/brand/logo.svg"} alt="gradesign." className="brand-wordmark" />
        <LoaderCircle className="spin" aria-label="Opening your workspace" />
      </div>
    );
  return route.share !== null ? <SharedView token={route.share} /> : <Studio />;
}

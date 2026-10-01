"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

// three.js is ~150 KB gzipped, so the scene loads after first paint and only in the browser.
const ClusterScene = dynamic(() => import("./cluster-scene"), {
  ssr: false,
  loading: () => <ClusterPlaceholder />,
});

function ClusterPlaceholder() {
  return (
    <div className="grid aspect-square w-full place-items-center">
      <div className="dot-grid size-3/4 rounded-full opacity-60 [mask-image:radial-gradient(circle,black,transparent_70%)]" />
    </div>
  );
}

let webgl: boolean | undefined;
function hasWebGL() {
  if (webgl === undefined) {
    try {
      const c = document.createElement("canvas");
      webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

const noop = () => () => {};

export function Cluster() {
  const supported = useSyncExternalStore(noop, hasWebGL, () => true);
  if (!supported) return <ClusterPlaceholder />;
  return <ClusterScene />;
}

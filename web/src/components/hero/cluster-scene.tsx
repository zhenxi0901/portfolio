"use client";

/* eslint-disable react-hooks/refs, react-hooks/immutability --
 * The frame loop mutates refs and three.js objects on every frame by design: that is the
 * react-three-fiber pattern for animation without re-rendering React 60 times a second. */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { scrollToId } from "@/lib/utils";

/**
 * A small "service mesh": hubs are systems ZhenXi has run or built, pods hang off them,
 * and packets travel the edges like requests. Click a hub to jump to the matching work.
 */

type Hub = { label: string; target: string };

const HUBS: Hub[] = [
  { label: "GKE", target: "case-gke" },
  { label: "Terraform", target: "case-gke" },
  { label: "Kafka", target: "case-reaper" },
  { label: "Cloud Build", target: "case-pipeline" },
  { label: "Grafana", target: "case-observability" },
  { label: "Prometheus", target: "case-observability" },
  { label: "Cloud Run", target: "case-aibe" },
  { label: "Vertex AI", target: "case-aibe" },
  { label: "SGLang", target: "research" },
  { label: "A100", target: "research" },
  { label: "ARIES", target: "research" },
  { label: "PVChat", target: "research" },
  { label: "SCADA", target: "experience" },
  { label: "MQTT", target: "experience" },
];

const POD_COUNT = 54;
const PACKET_COUNT = 30;

type Palette = { hub: string; pod: string; edge: string; packet: string };

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || "#888";
  return { hub: v("--ink"), pod: v("--ink-3"), edge: v("--line-strong"), packet: v("--accent-ink") };
}

function usePalette(): Palette | null {
  const [palette, setPalette] = useState<Palette | null>(null);
  useEffect(() => {
    const update = () => setPalette(readPalette());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return palette;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Graph = {
  nodes: THREE.Vector3[]; // hubs first, then pods
  edges: [number, number][];
  adjacency: number[][]; // node -> edge indices
};

function buildGraph(): Graph {
  const rand = mulberry32(20260930);
  const nodes: THREE.Vector3[] = [];
  const n = HUBS.length;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i;
    const radius = 2.05 + (rand() - 0.5) * 0.35;
    nodes.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius * 0.92, Math.sin(theta) * r * radius));
  }
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
  };
  // Each hub links to its two nearest hubs.
  for (let i = 0; i < n; i++) {
    const near = nodes
      .slice(0, n)
      .map((p, j) => ({ j, d: p.distanceTo(nodes[i]) }))
      .filter((x) => x.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach(({ j }) => add(i, j));
  }
  // Pods orbit a hub; some also talk to a neighbouring pod.
  for (let k = 0; k < POD_COUNT; k++) {
    const hub = Math.floor(rand() * n);
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const pos = nodes[hub].clone().add(dir.multiplyScalar(0.32 + rand() * 0.5));
    const idx = nodes.push(pos) - 1;
    add(idx, hub);
    if (k > 0 && rand() < 0.3) add(idx, idx - 1);
  }
  const adjacency: number[][] = nodes.map(() => []);
  edges.forEach(([a, b], e) => {
    adjacency[a].push(e);
    adjacency[b].push(e);
  });
  return { nodes, edges, adjacency };
}

type Packet = { edge: number; t: number; speed: number; forward: boolean };

function Mesh({
  graph,
  palette,
  hovered,
  setHovered,
  labelRefs,
  burstRef,
  reduce,
  drag,
}: {
  graph: Graph;
  palette: Palette;
  hovered: number | null;
  setHovered: (i: number | null) => void;
  labelRefs: React.RefObject<(HTMLButtonElement | null)[]>;
  burstRef: React.RefObject<(hub: number) => void>;
  reduce: boolean;
  drag: React.RefObject<{ vx: number; vy: number; tiltX: number; tiltY: number }>;
}) {
  const group = useRef<THREE.Group>(null);
  const pods = useRef<THREE.InstancedMesh>(null);
  const packetsMesh = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const { camera, size } = useThree();
  const hubCount = HUBS.length;

  const edgeGeometry = useMemo(() => {
    const pos = new Float32Array(graph.edges.length * 6);
    graph.edges.forEach(([a, b], i) => {
      graph.nodes[a].toArray(pos, i * 6);
      graph.nodes[b].toArray(pos, i * 6 + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [graph]);

  const packets = useRef<Packet[]>([]);
  if (packets.current.length === 0) {
    const rand = mulberry32(7);
    packets.current = Array.from({ length: PACKET_COUNT }, () => ({
      edge: Math.floor(rand() * graph.edges.length),
      t: rand(),
      speed: 0.35 + rand() * 0.5,
      forward: rand() > 0.5,
    }));
  }

  // Clicking a hub sends a burst of packets out along its edges.
  useEffect(() => {
    burstRef.current = (hub: number) => {
      const out = graph.adjacency[hub];
      packets.current.slice(0, Math.min(10, packets.current.length)).forEach((p, i) => {
        p.edge = out[i % out.length];
        const [a] = graph.edges[p.edge];
        p.forward = a === hub;
        p.t = 0;
        p.speed = 0.9 + Math.random() * 0.4;
      });
    };
  }, [burstRef, graph]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = hubCount; i < graph.nodes.length; i++) {
      m.makeTranslation(graph.nodes[i].x, graph.nodes[i].y, graph.nodes[i].z);
      pods.current?.setMatrixAt(i - hubCount, m);
    }
    if (pods.current) pods.current.instanceMatrix.needsUpdate = true;
  }, [graph, hubCount]);

  const tmp = useMemo(
    () => ({ v: new THREE.Vector3(), w: new THREE.Vector3(), m: new THREE.Matrix4(), s: new THREE.Vector3(1, 1, 1), q: new THREE.Quaternion() }),
    [],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = group.current;
    if (!g) return;
    const d = drag.current;

    // Spin: slow idle rotation plus whatever momentum the user gave it.
    const idle = reduce ? 0 : 0.06;
    g.rotation.y += (idle + d.vx) * dt;
    g.rotation.x = THREE.MathUtils.clamp(g.rotation.x + d.vy * dt, -0.6, 0.6);
    d.vx *= 0.94;
    d.vy *= 0.94;
    // Gentle parallax toward the pointer.
    g.position.x += (d.tiltX * 0.25 - g.position.x) * 0.05;
    g.position.y += (d.tiltY * 0.18 - g.position.y) * 0.05;
    g.updateMatrixWorld();

    // Packets travel along edges and hop to a neighbouring edge on arrival.
    if (packetsMesh.current) {
      packets.current.forEach((p, i) => {
        if (!reduce) {
          const [a, b] = graph.edges[p.edge];
          const len = graph.nodes[a].distanceTo(graph.nodes[b]) || 1;
          p.t += (p.speed * dt) / len;
          if (p.t >= 1) {
            const end = p.forward ? b : a;
            const options = graph.adjacency[end];
            p.edge = options[Math.floor(Math.random() * options.length)];
            p.forward = graph.edges[p.edge][0] === end;
            p.t = 0;
            p.speed = 0.35 + Math.random() * 0.5;
          }
        }
        const [a, b] = graph.edges[p.edge];
        const from = p.forward ? graph.nodes[a] : graph.nodes[b];
        const to = p.forward ? graph.nodes[b] : graph.nodes[a];
        tmp.v.lerpVectors(from, to, p.t);
        tmp.m.compose(tmp.v, tmp.q, tmp.s);
        packetsMesh.current!.setMatrixAt(i, tmp.m);
      });
      packetsMesh.current.instanceMatrix.needsUpdate = true;
    }

    // Halo rings always face the camera.
    rings.current.forEach((r) => r?.quaternion.copy(camera.quaternion));

    // Project hub positions to screen space for the DOM labels.
    const labels = labelRefs.current;
    for (let i = 0; i < hubCount; i++) {
      const el = labels?.[i];
      if (!el) continue;
      tmp.w.copy(graph.nodes[i]).applyMatrix4(g.matrixWorld);
      const depth = tmp.w.z; // toward the camera is positive
      tmp.w.project(camera);
      const x = ((tmp.w.x + 1) / 2) * size.width;
      const y = ((1 - tmp.w.y) / 2) * size.height;
      const front = THREE.MathUtils.clamp((depth + 2.2) / 4.4, 0, 1);
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -170%) scale(${0.82 + front * 0.22})`;
      el.style.opacity = hovered === i ? "1" : String(0.25 + front * 0.75);
      el.style.zIndex = String(Math.round(front * 100));
    }
  });

  return (
    <group ref={group}>
      <lineSegments geometry={edgeGeometry}>
        <lineBasicMaterial color={palette.edge} transparent opacity={0.9} />
      </lineSegments>

      <instancedMesh ref={pods} args={[undefined, undefined, POD_COUNT]}>
        <sphereGeometry args={[0.028, 12, 12]} />
        <meshBasicMaterial color={palette.pod} />
      </instancedMesh>

      <instancedMesh ref={packetsMesh} args={[undefined, undefined, PACKET_COUNT]}>
        <sphereGeometry args={[0.04, 10, 10]} />
        <meshBasicMaterial color={palette.packet} />
      </instancedMesh>

      {HUBS.map((hub, i) => (
        <group key={hub.label} position={graph.nodes[i]}>
          <mesh
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(i);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = "";
            }}
            onClick={(e) => {
              e.stopPropagation();
              burstRef.current?.(i);
              window.setTimeout(() => scrollToId(hub.target), reduce ? 0 : 450);
            }}
          >
            <sphereGeometry args={[hovered === i ? 0.09 : 0.062, 24, 24]} />
            <meshBasicMaterial color={hovered === i ? palette.packet : palette.hub} />
          </mesh>
          <mesh ref={(el) => { rings.current[i] = el; }}>
            <ringGeometry args={[0.13, 0.142, 40]} />
            <meshBasicMaterial
              color={hovered === i ? palette.packet : palette.hub}
              transparent
              opacity={hovered === i ? 1 : 0.28}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export default function ClusterScene() {
  const palette = usePalette();
  const graph = useMemo(() => buildGraph(), []);
  const [hovered, setHovered] = useState<number | null>(null);
  const [inView, setInView] = useState(true);
  const [reduce, setReduce] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const burstRef = useRef<(hub: number) => void>(() => {});
  const drag = useRef({ vx: 0, vy: 0, tiltX: 0, tiltY: 0 });
  const pointer = useRef<{ x: number; y: number; down: boolean }>({ x: 0, y: 0, down: false });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.05 });
    if (wrap.current) io.observe(wrap.current);
    return () => {
      mq.removeEventListener("change", sync);
      io.disconnect();
    };
  }, []);

  const onPointerMove = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect();
    drag.current.tiltX = ((e.clientX - r.left) / r.width - 0.5) * 2;
    drag.current.tiltY = -((e.clientY - r.top) / r.height - 0.5) * 2;
    if (pointer.current.down) {
      drag.current.vx += (e.clientX - pointer.current.x) * 0.018;
      drag.current.vy += (e.clientY - pointer.current.y) * 0.012;
    }
    pointer.current.x = e.clientX;
    pointer.current.y = e.clientY;
  };

  return (
    <div
      ref={wrap}
      className="relative aspect-square w-full touch-pan-y select-none"
      onPointerDown={(e) => {
        pointer.current = { x: e.clientX, y: e.clientY, down: true };
      }}
      onPointerUp={() => (pointer.current.down = false)}
      onPointerLeave={() => {
        pointer.current.down = false;
        drag.current.tiltX = 0;
        drag.current.tiltY = 0;
      }}
      onPointerMove={onPointerMove}
    >
      {palette && (
        <Canvas
          frameloop={inView ? "always" : "never"}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0, 6.4], fov: 40 }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          aria-hidden
        >
          <Mesh
            graph={graph}
            palette={palette}
            hovered={hovered}
            setHovered={setHovered}
            labelRefs={labelRefs}
            burstRef={burstRef}
            reduce={reduce}
            drag={drag}
          />
        </Canvas>
      )}
      <div className="pointer-events-none absolute inset-0">
        {HUBS.map((hub, i) => (
          <button
            key={hub.label}
            ref={(el) => {
              labelRefs.current[i] = el;
            }}
            type="button"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            onClick={() => {
              burstRef.current?.(i);
              window.setTimeout(() => scrollToId(hub.target), reduce ? 0 : 450);
            }}
            className="pointer-events-auto absolute left-0 top-0 whitespace-nowrap rounded-full border border-line bg-surface/90 px-2.5 py-1 font-mono text-[11px] text-ink-2 opacity-0 shadow-soft backdrop-blur-sm transition-colors hover:border-accent-ink hover:text-ink focus-visible:text-ink"
            aria-label={`${hub.label}: jump to related work`}
          >
            {hub.label}
          </button>
        ))}
      </div>
    </div>
  );
}

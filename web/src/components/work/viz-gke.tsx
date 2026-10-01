"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { Segmented } from "@/components/work/segmented";

type Mode = "before" | "after";

/*
 * A small, honest model of how this cluster scales (from its manifests):
 *  - Core API: HPA min 2 / max 6 at 70% CPU. Each pod requests 3 GiB, and with the other pods
 *    already on a node only one fits, so an extra replica waits Pending.
 *  - The cluster autoscaler sees the Pending pod and adds a node: pool min 1 / max 3 per zone
 *    across 3 zones, i.e. 3 to 9 nodes. Zone spread (maxSkew 1) keeps zones balanced.
 *  - Scale-down waits out a cool-down. Time is compressed here; real windows are 2 min / 5 min.
 */
const ZONES = ["a", "b", "c"] as const;
const MIN_NODES = 3;
const SCALE_UP_MS = 1100;
const SCALE_DOWN_MS = 1700;

const replicasFor = (traffic: number) => Math.min(6, Math.max(2, Math.ceil(traffic * 1.2)));
const nodesFor = (replicas: number) => Math.max(MIN_NODES, replicas);

type Node = { name: string; zone: (typeof ZONES)[number]; first: boolean; core: boolean };

function layout(replicas: number, nodeCount: number) {
  const nodes: Node[] = Array.from({ length: nodeCount }, (_, i) => {
    const zone = ZONES[i % 3];
    const k = Math.floor(i / 3) + 1;
    return { name: `node-${zone}${k}`, zone, first: k === 1, core: i < replicas };
  });
  return { nodes, pending: Math.max(0, replicas - nodeCount) };
}

export function GkeViz() {
  const [mode, setMode] = useState<Mode>("before");
  const [touched, setTouched] = useState(false);
  const [traffic, setTraffic] = useState(1);
  const replicas = replicasFor(traffic);
  const [nodeCount, setNodeCount] = useState(MIN_NODES);
  const [event, setEvent] = useState("Steady state: 2 Core API pods, 3 nodes (the pool's floor).");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();

  // Play the migration once when the card is first seen; after that the toggle is the visitor's.
  useEffect(() => {
    if (!inView || touched || reduce) return;
    const t = setTimeout(() => setMode("after"), 900);
    return () => clearTimeout(t);
  }, [inView, touched, reduce]);

  // Cluster autoscaler: close the gap between the nodes we have and the nodes the pods need.
  const needed = nodesFor(replicas);
  useEffect(() => {
    if (needed === nodeCount) return;
    const up = needed > nodeCount;
    const t = setTimeout(
      () => {
        const diff = Math.abs(needed - nodeCount);
        setNodeCount(needed);
        setEvent(
          up
            ? `Cluster autoscaler added ${diff} node${diff > 1 ? "s" : ""} in the emptiest zone. The Pending pod${diff > 1 ? "s are" : " is"} scheduled.`
            : `Cool-down over: ${diff} empty node${diff > 1 ? "s" : ""} drained and removed. Back toward the floor of 3.`,
        );
      },
      reduce ? 0 : up ? SCALE_UP_MS : SCALE_DOWN_MS,
    );
    return () => clearTimeout(t);
  }, [needed, nodeCount, reduce]);

  const { nodes, pending } = layout(replicas, nodeCount);

  const onTraffic = (v: number) => {
    const next = replicasFor(v);
    if (next > replicas) {
      setEvent(
        nodesFor(next) > nodeCount
          ? `CPU over the 70% target: the HPA asks for ${next} Core API pods. Each needs 3 GiB and no node has room, so the new pod waits Pending.`
          : `CPU over the 70% target: the HPA asks for ${next} Core API pods. There is a free node, so it schedules at once.`,
      );
    } else if (next < replicas) {
      setEvent(
        nodesFor(next) < nodeCount
          ? `Load dropped: the HPA scales Core API to ${next}. A node is now empty; the autoscaler waits out its cool-down first.`
          : `Load dropped: the HPA scales Core API to ${next}.`,
      );
    }
    setTraffic(v);
  };

  return (
    <div ref={ref} className="flex h-full flex-col gap-5">
      <Segmented
        label="Architecture"
        value={mode}
        onChange={(v) => {
          setTouched(true);
          setMode(v);
        }}
        options={[
          { value: "before", label: "Before" },
          { value: "after", label: "After" },
        ]}
      />

      <LayoutGroup>
        {mode === "before" ? (
          <motion.div layout className="rounded-2xl border border-line-strong bg-surface/85 p-3.5 backdrop-blur-[2px]">
            <motion.p layout="position" className="mb-3 font-mono text-[11px] text-ink-3">
              One VM, Docker Compose, one in-memory queue
            </motion.p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["core-node-a1", "Core API"],
                ["kafka-a", "Message queue"],
                ["zk-a", "Coordination"],
                ["mqtt", "MQTT broker"],
                ["db", "PostgreSQL"],
              ].map(([id, text]) => (
                <Pod key={id} id={id} text={text} />
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div layout className="flex flex-col gap-3">
            <Zone title="Edge: Cloud Armor, HTTPS load balancer, Ingress">
              <Pod id="armor" text="Cloud Armor WAF" tone="edge" />
              <Pod id="lb" text="HTTPS load balancer" tone="edge" />
            </Zone>

            <motion.div layout className="rounded-2xl border border-line-strong bg-surface/85 p-3.5 backdrop-blur-[2px]">
              <motion.p layout="position" className="mb-3 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-ink-3">
                <span>Regional GKE, 3 zones</span>
                <span className="text-ink" aria-live="polite">
                  {nodeCount} of 9 nodes, {replicas} Core API pods
                </span>
              </motion.p>
              <div className="grid grid-cols-3 gap-2">
                {ZONES.map((zone) => (
                  <div key={zone} className="flex flex-col gap-2">
                    <p className="font-mono text-[10px] text-ink-3">zone {zone}</p>
                    <AnimatePresence mode="popLayout" initial={false}>
                      {nodes
                        .filter((n) => n.zone === zone)
                        .map((n) => (
                          <motion.div
                            layout
                            key={n.name}
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            transition={{ type: "spring", stiffness: 180, damping: 22 }}
                            className={
                              "rounded-xl border bg-surface-2/70 p-2 " + (n.first ? "border-line" : "border-accent-ink/60")
                            }
                          >
                            <p className="mb-1.5 font-mono text-[10px] text-ink-3">{n.name}</p>
                            <div className="flex min-h-6 flex-wrap gap-1">
                              {n.first && (
                                <>
                                  <Pod id={`kafka-${zone}`} text="Kafka" small />
                                  <Pod id={`zk-${zone}`} text="ZooKeeper" small />
                                </>
                              )}
                              {n.core && <Pod id={`core-${n.name}`} text="Core API" small tone="api" />}
                            </div>
                          </motion.div>
                        ))}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {pending > 0 && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-accent-ink/70 p-2"
                  >
                    <span className="font-mono text-[10px] text-ink-2">Pending, needs 3 GiB, no node has room:</span>
                    {Array.from({ length: pending }, (_, i) => (
                      <Pod key={i} id={`pending-${i}`} text="Core API" small tone="pending" />
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
              <p className="mt-2 font-mono text-[10px] text-ink-3">Rule engine, web UI and cache pods not shown.</p>
            </motion.div>

            <Zone title="Managed, over private service access">
              <Pod id="db" text="Cloud SQL" />
            </Zone>
          </motion.div>
        )}
      </LayoutGroup>

      <AnimatePresence initial={false}>
        {mode === "after" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl border border-line bg-surface p-3.5"
          >
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Traffic</span>
              <span className="font-mono text-xs text-ink-2">
                {traffic.toFixed(1)}x load, {replicas} pods, {nodeCount} nodes
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              value={traffic}
              onChange={(e) => onTraffic(Number(e.target.value))}
              className="mt-3 w-full accent-[var(--accent-ink)]"
              aria-label="Traffic multiplier"
            />
            <p className="mt-2 min-h-10 text-xs leading-relaxed text-ink-2" aria-live="polite">
              {event}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-auto font-mono text-[11px] text-ink-3">
        {mode === "before"
          ? "One failure domain, deployed by hand, and a queue that could not be shared."
          : "Time is compressed: the real windows are 2 min to scale up, 5 min to scale down."}
      </p>
    </div>
  );
}

function Zone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div layout className="rounded-2xl border border-line-strong bg-surface/85 p-3.5 backdrop-blur-[2px]">
      <motion.p layout="position" className="mb-3 font-mono text-[11px] text-ink-3">
        {title}
      </motion.p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </motion.div>
  );
}

function Pod({
  id,
  text,
  small,
  tone = "plain",
}: {
  id: string;
  text: string;
  small?: boolean;
  tone?: "plain" | "edge" | "api" | "pending";
}) {
  return (
    <motion.span
      layoutId={`gke-${id}`}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: tone === "pending" ? 0.75 : 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className={
        "rounded-full border font-medium " +
        (small ? "px-2 py-0.5 text-[11px] " : "px-2.5 py-1 text-xs ") +
        (tone === "edge"
          ? "border-transparent bg-accent text-on-accent"
          : tone === "api"
            ? "border-transparent bg-accent text-on-accent"
            : tone === "pending"
              ? "border-dashed border-accent-ink bg-transparent text-ink-2"
              : "border-line bg-surface text-ink")
      }
    >
      {text}
    </motion.span>
  );
}

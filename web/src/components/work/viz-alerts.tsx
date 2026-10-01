"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowCounterClockwise, ArrowRight, BellRinging, CheckCircle, Crown, Power } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { openPlatformTab } from "@/lib/utils";

const NODES = ["zk-0", "zk-1", "zk-2"];

/** Three-node ZooKeeper ensemble: lose one and the quorum holds, lose two and the alert pages. */
export function AlertsViz() {
  const [alive, setAlive] = useState([true, true, true]);
  const up = alive.filter(Boolean).length;
  const quorum = up >= 2;
  const leader = quorum ? alive.findIndex(Boolean) : -1;
  const reElected = quorum && !alive[0];

  const stopOne = () => {
    const i = alive.findIndex(Boolean);
    if (i < 0) return;
    setAlive((a) => a.map((v, j) => (j === i ? false : v)));
  };

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="grid grid-cols-3 gap-2">
        {NODES.map((n, i) => (
          <motion.div
            key={n}
            animate={{ opacity: alive[i] ? 1 : 0.45, scale: alive[i] ? 1 : 0.96 }}
            className="relative rounded-2xl border border-line bg-surface p-3"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">{n}</span>
              {leader === i && <Crown size={14} weight="fill" className="text-accent-ink" aria-label="leader" />}
            </div>
            <p className="mt-3 text-xs text-ink-2">
              {!alive[i] ? "stopped" : !quorum ? "looking" : leader === i ? "leader" : "follower"}
            </p>
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {quorum ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5"
            role="status"
          >
            <CheckCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-good" />
            <div className="text-sm">
              <p className="font-medium">Quorum held, {up} of 3 up</p>
              <p className="mt-0.5 text-ink-2">{reElected ? "A new leader was elected. Dashboard only, nobody paged." : "All quiet."}</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="alert"
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-2xl border border-critical/40 bg-surface p-3.5"
            role="alert"
          >
            <BellRinging size={20} weight="fill" className="mt-0.5 shrink-0 text-critical" />
            <div className="text-sm">
              <p className="font-medium">Critical: ZooKeeper quorum lost</p>
              <p className="mt-0.5 text-ink-2">Kafka can no longer elect controllers. Paging on-call.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto flex gap-2">
        <Button size="sm" onClick={stopOne} disabled={up === 0}>
          <Power weight="bold" /> Stop a node
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setAlive([true, true, true])} disabled={up === 3}>
          <ArrowCounterClockwise /> Restore
        </Button>
      </div>
      <button
        type="button"
        onClick={() => openPlatformTab("signals")}
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium underline decoration-accent-ink decoration-2 underline-offset-4"
      >
        Every signal I alert on, and why <ArrowRight size={14} />
      </button>
    </div>
  );
}

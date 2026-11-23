"use client";

import { useSyncExternalStore } from "react";
import { onUnplug, unpluggedPart, type Part } from "@/lib/unplug";

/** What is unplugged in this tab, if anything (lib/unplug). Nothing on the server and in the first render. */
export const useUnplugged = (): Part | null => useSyncExternalStore(onUnplug, unpluggedPart, () => null);

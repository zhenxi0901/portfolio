import type { KeyboardEvent } from "react";

/**
 * Arrow keys for a row or column of role="tab" buttons, as the WAI-ARIA tabs pattern expects: the
 * arrows move to the previous or next tab and select it, Home and End jump to the ends. Put it on
 * the tablist's onKeyDown, and give only the selected tab tabIndex 0 (the rest -1), so the whole
 * list is one stop for the Tab key instead of one per tab.
 */
export function onTabKeys(e: KeyboardEvent<HTMLElement>, count: number, index: number, select: (i: number) => void) {
  const to: Record<string, number> = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: count - 1 };
  if (!(e.key in to)) return;
  e.preventDefault();
  const i = (to[e.key] + count) % count;
  select(i);
  e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')[i]?.focus();
}

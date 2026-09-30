/**
 * Hand-off state for the swipe-driven tab transition: the outgoing screen
 * records where the next screen should enter from, right before navigating.
 */
export interface TabEnter {
  path: string;
  /** 1 = enter from the right, -1 = enter from the left. */
  dir: 1 | -1;
  seq: number;
}

let pending: TabEnter | null = null;
let seq = 0;

export function beginTabEnter(path: string, dir: 1 | -1): void {
  pending = { path, dir, seq: ++seq };
}

/** Consumed by the target screen during the render it becomes active. */
export function takeTabEnter(path: string): TabEnter | null {
  if (pending && pending.path === path) {
    const taken = pending;
    pending = null;
    return taken;
  }
  return null;
}

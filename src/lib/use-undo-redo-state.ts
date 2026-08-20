import { useCallback, useEffect, useRef, useState } from "react";

// Generic undo/redo history over a single value (the page builder uses this
// for {blocks, theme} together, so design changes and block edits share one
// stack). Consumers call `set` for every change; rapid changes within
// `debounceMs` of each other collapse into one history entry so e.g. typing
// in a heading field doesn't push a new undo step per keystroke.
export function useUndoRedoState<T>(initial: T, debounceMs = 500) {
  const [value, setValue] = useState(initial);
  const undoStack = useRef<T[]>([]);
  const redoStack = useRef<T[]>([]);
  const pendingBoundary = useRef<T | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceRender] = useState(0);

  // Reset history when the underlying record changes identity (e.g. loading
  // a different business's layout) rather than every re-render.
  const resetTo = useCallback((next: T) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    undoStack.current = [];
    redoStack.current = [];
    pendingBoundary.current = null;
    setValue(next);
  }, []);

  const set = useCallback(
    (updater: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
        if (pendingBoundary.current === null) pendingBoundary.current = prev;
        redoStack.current = [];
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          if (pendingBoundary.current !== null) {
            undoStack.current.push(pendingBoundary.current);
            pendingBoundary.current = null;
            forceRender((n) => n + 1);
          }
        }, debounceMs);
        return next;
      });
    },
    [debounceMs],
  );

  // Commit immediately — used for discrete actions (add/remove/reorder
  // block, pick a design preset) that should always be their own undo step
  // regardless of the typing debounce.
  const commitNow = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (pendingBoundary.current !== null) {
      undoStack.current.push(pendingBoundary.current);
      pendingBoundary.current = null;
      forceRender((n) => n + 1);
    }
  }, []);

  const undo = useCallback(() => {
    commitNow();
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    setValue((current) => {
      redoStack.current.push(current);
      return prev;
    });
    forceRender((n) => n + 1);
  }, [commitNow]);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (next === undefined) return;
    setValue((current) => {
      undoStack.current.push(current);
      return next;
    });
    forceRender((n) => n + 1);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return {
    value,
    set,
    resetTo,
    commitNow,
    undo,
    redo,
    canUndo: undoStack.current.length > 0 || pendingBoundary.current !== null,
    canRedo: redoStack.current.length > 0,
  };
}

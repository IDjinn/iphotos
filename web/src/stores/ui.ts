import { create } from "zustand";

interface ViewerState {
  /** Photo ids of the list the viewer was opened from (drives prev/next). */
  photoIds: string[];
  index: number;
  open: (photoIds: string[], index: number) => void;
  close: () => void;
  next: () => void;
  previous: () => void;
  /** Removes the current photo from the viewer list (after deletion). */
  removeCurrent: () => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  photoIds: [],
  index: 0,
  open: (photoIds, index) => set({ photoIds, index }),
  close: () => set({ photoIds: [], index: 0 }),
  next: () =>
    set((state) => ({ index: Math.min(state.index + 1, state.photoIds.length - 1) })),
  previous: () => set((state) => ({ index: Math.max(state.index - 1, 0) })),
  removeCurrent: () => {
    const { photoIds, index, close } = get();
    const remaining = photoIds.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      close();
      return;
    }
    set({ photoIds: remaining, index: Math.min(index, remaining.length - 1) });
  },
}));

interface UploadDialogState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useUploadDialogStore = create<UploadDialogState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

// ---------------------------------------------------------------------------
// Upload queue

export type UploadTaskStatus = "queued" | "uploading" | "done" | "duplicated" | "error";

export interface UploadTask {
  id: string;
  name: string;
  sizeBytes: number;
  status: UploadTaskStatus;
  /** 0..1 */
  progress: number;
  message?: string;
  quotaExceeded?: boolean;
}

export interface EnqueueResult {
  accepted: number;
  /** Neutral reasons, one per rejected file (for inline display). */
  rejected: number;
}

/**
 * Per-file caps, mirroring the backend `Upload` section (docs/plans/09 §3.2).
 * Both come from NEXT_PUBLIC env so future edits need no code change; a limit
 * of 0 (or unset `MAX_VIDEO_BYTES`) disables the cap — videos are unlimited
 * for now.
 */
const MAX_IMAGE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_IMAGE_BYTES) || 200 * 1024 * 1024;
const MAX_VIDEO_BYTES = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_BYTES) || 0;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function validateUpload(file: File): string | null {
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return "Only photos and videos can be uploaded.";
  const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (maxBytes > 0 && file.size > maxBytes) {
    return `${isVideo ? "Videos" : "Photos"} can be up to ${formatMb(maxBytes)}.`;
  }
  return null;
}

/** Files live outside the store (not serializable). */
const fileRefs = new Map<string, File>();

export function getFileForTask(id: string): File | undefined {
  return fileRefs.get(id);
}

interface UploadQueueState {
  tasks: UploadTask[];
  lastRejection: string | null;
  enqueue: (files: File[]) => EnqueueResult;
  patch: (id: string, patch: Partial<UploadTask>) => void;
  clearFinished: () => void;
  reset: () => void;
}

let taskId = 0;

export const useUploadQueueStore = create<UploadQueueState>((set) => ({
  tasks: [],
  lastRejection: null,
  enqueue: (files) => {
    let accepted = 0;
    let rejected = 0;
    const next: UploadTask[] = [];
    for (const file of files) {
      const reason = validateUpload(file);
      if (reason) {
        rejected += 1;
        continue;
      }
      const id = `upload-${Date.now()}-${taskId++}`;
      fileRefs.set(id, file);
      next.push({
        id,
        name: file.name,
        sizeBytes: file.size,
        status: "queued",
        progress: 0,
      });
      accepted += 1;
    }
    if (accepted > 0) set((state) => ({ tasks: [...state.tasks, ...next] }));
    const lastRejection = rejected > 0 ? rejectionCopy(rejected) : null;
    set({ lastRejection });
    return { accepted, rejected };
  },
  patch: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    })),
  clearFinished: () =>
    set((state) => {
      for (const task of state.tasks) {
        if (task.status !== "queued" && task.status !== "uploading") fileRefs.delete(task.id);
      }
      return { tasks: state.tasks.filter((t) => t.status === "queued" || t.status === "uploading"), lastRejection: null };
    }),
  reset: () => {
    for (const id of fileRefs.keys()) fileRefs.delete(id);
    set({ tasks: [], lastRejection: null });
  },
}));

function rejectionCopy(count: number): string {
  return count === 1
    ? "1 file was skipped — only photos and videos are accepted."
    : `${count} files were skipped — only photos and videos are accepted.`;
}

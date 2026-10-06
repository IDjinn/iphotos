import { beforeEach, describe, expect, it } from "vitest";
import { useUploadQueueStore } from "./ui";

function pngFile(name: string, sizeBytes = 1024): File {
  const bytes = new Uint8Array(sizeBytes);
  return new File([bytes], name, { type: "image/png" });
}

describe("upload queue validation", () => {
  beforeEach(() => {
    useUploadQueueStore.getState().reset();
  });

  it("accepts image files and queues them", () => {
    const result = useUploadQueueStore.getState().enqueue([pngFile("a.png")]);
    expect(result).toEqual({ accepted: 1, rejected: 0 });
    expect(useUploadQueueStore.getState().tasks).toHaveLength(1);
  });

  it("rejects non-image files with a neutral reason", () => {
    const file = new File([new Uint8Array(10)], "doc.pdf", { type: "application/pdf" });
    const result = useUploadQueueStore.getState().enqueue([file]);
    expect(result).toEqual({ accepted: 0, rejected: 1 });
    expect(useUploadQueueStore.getState().lastRejection).toContain("only photos and videos");
  });

  it("accepts video files without a size cap", () => {
    const file = new File([new Uint8Array(10)], "clip.mp4", { type: "video/mp4" });
    const result = useUploadQueueStore.getState().enqueue([file]);
    expect(result).toEqual({ accepted: 1, rejected: 0 });
  });

  it("rejects images over the configured size cap", () => {
    const file = pngFile("big.png", 200 * 1024 * 1024 + 1);
    const result = useUploadQueueStore.getState().enqueue([file]);
    expect(result.rejected).toBe(1);
  });

  it("keeps tasks untouched when everything is rejected", () => {
    useUploadQueueStore.getState().enqueue([pngFile("a.png")]);
    const file = new File([new Uint8Array(10)], "doc.pdf", { type: "application/pdf" });
    useUploadQueueStore.getState().enqueue([file]);
    expect(useUploadQueueStore.getState().tasks).toHaveLength(1);
  });
});

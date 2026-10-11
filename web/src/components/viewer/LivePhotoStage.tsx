"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Disc2Icon, FilmIcon, Loader2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { setKeyPhoto, type CloudPhoto } from "@/data/cloud-photos-repository";
import { invalidateAuthFileUrls, useAuthFileUrl } from "@/data/blob-cache";
import { LivePill, LiveVideo, Photo, StageTool } from "./viewer.styles";

interface LiveFrame {
  /** Seconds from the start of the motion clip. */
  offset: number;
  url: string;
}

interface LivePhotoStageProps {
  photo: CloudPhoto;
  previewUrl: string;
}

const SEEK_TIMEOUT_MS = 2_000;

/**
 * iOS-style Live Photo stage: the still shows by default, press-and-hold (or the
 * LIVE pill) plays the paired motion clip, and the frames strip lets the user
 * scrub the clip and set any frame as the key photo.
 */
export function LivePhotoStage({ photo, previewUrl }: LivePhotoStageProps) {
  const queryClient = useQueryClient();
  const hasMotion = photo.variants.some((v) => v.kind === "Motion");
  const motionQuery = useAuthFileUrl(photo.id, "motion", hasMotion);
  const motionUrl = motionQuery.data ?? null;

  const [playing, setPlaying] = useState(false);
  const [framesOpen, setFramesOpen] = useState(false);
  const [frames, setFrames] = useState<LiveFrame[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Press-and-hold on the still plays the clip; release anywhere stops it.
  const onHoldStart = useCallback(() => {
    if (hasMotion && motionUrl && !framesOpen) setPlaying(true);
  }, [hasMotion, motionUrl, framesOpen]);

  useEffect(() => {
    if (!playing) return;
    const stop = () => setPlaying(false);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
  }, [playing]);

  // NOTE: the overlay remounts this stage per photo (`key={photoId}`), so no
  // reset-on-photo-change effect is needed — state dies with the mount.

  const applyKeyPhoto = useMutation({
    mutationFn: (offset: number) => setKeyPhoto(photo.id, offset),
    onSuccess: async () => {
      toast("Key photo updated");
      setSelected(null);
      // The still's bytes changed server-side: drop cached object URLs first,
      // then refetch every query holding one.
      invalidateAuthFileUrls(photo.id);
      await queryClient.invalidateQueries({ queryKey: ["file-url"] });
      await queryClient.invalidateQueries({ queryKey: ["photo", photo.id] });
      await queryClient.invalidateQueries({ queryKey: ["photos"] });
    },
    onError: () => toast.error("Couldn't update the key photo. Try again."),
  });

  const showMotionSurface = Boolean(motionUrl) && (playing || (framesOpen && selected !== null));

  // Paused scrub surface: mirror the selected frame offset onto the video.
  useEffect(() => {
    if (!showMotionSurface || playing) return;
    const video = videoRef.current;
    if (video && selected !== null) {
      video.currentTime = Math.max(0, selected - 0.001);
    }
  }, [showMotionSurface, playing, selected, motionUrl]);

  const openFrames = async () => {
    setFramesOpen(true);
    if (frames || extracting || !motionUrl) return;
    setExtracting(true);
    try {
      setFrames(await extractFrames(motionUrl));
    } catch {
      toast.error("Couldn't extract the frames of this clip.");
      setFramesOpen(false);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <>
      {showMotionSurface && motionUrl ? (
        <LiveVideo
          key={`${photo.id}-motion`}
          ref={videoRef}
          src={motionUrl}
          poster={previewUrl}
          muted
          playsInline
          autoPlay={playing}
          onEnded={() => setPlaying(false)}
          aria-label={`Live motion of ${photo.fileName}`}
        />
      ) : (
        <Photo
          key={photo.id}
          src={previewUrl}
          alt={photo.fileName}
          onPointerDown={onHoldStart}
          style={hasMotion ? { cursor: "pointer" } : undefined}
          aria-label={hasMotion ? `${photo.fileName} (hold to play)` : photo.fileName}
        />
      )}

      {hasMotion ? (
        <LivePill
          $playing={playing}
          onClick={() => setPlaying((p) => !p)}
          disabled={!motionUrl}
          title={motionUrl ? "Hold the photo (or click) to play" : "Loading motion clip…"}
          aria-pressed={playing}
        >
          <Disc2Icon aria-hidden />
          LIVE
        </LivePill>
      ) : (
        <LivePill $playing={false} disabled title="Motion clip unavailable">
          <Disc2Icon aria-hidden />
          LIVE
        </LivePill>
      )}

      {hasMotion && motionUrl ? (
        <StageTool onClick={() => void openFrames()} aria-pressed={framesOpen} aria-label="Frames">
          {extracting ? (
            <Loader2Icon aria-hidden className="size-5 animate-spin" />
          ) : (
            <FilmIcon aria-hidden className="size-5" />
          )}
        </StageTool>
      ) : null}

      {framesOpen && motionUrl ? (
        <FramesStrip
          frames={frames}
          selected={selected}
          applying={applyKeyPhoto.isPending}
          onSelect={(offset) => setSelected((current) => (current === offset ? null : offset))}
          onApply={() => selected !== null && applyKeyPhoto.mutate(selected)}
          onClose={() => {
            setFramesOpen(false);
            setSelected(null);
          }}
        />
      ) : null}
    </>
  );
}

interface FramesStripProps {
  frames: LiveFrame[] | null;
  selected: number | null;
  applying: boolean;
  onSelect: (offset: number) => void;
  onApply: () => void;
  onClose: () => void;
}

/**
 * Bottom filmstrip (iOS "Set as Key Photo"): tap a frame to preview it on the
 * stage, then apply. Exits: the X button or clicking outside (popover).
 */
function FramesStrip({ frames, selected, applying, onSelect, onApply, onClose }: FramesStripProps) {
  return (
    <div
      role="group"
      aria-label="Motion frames"
      className="absolute bottom-16 left-1 right-1 z-10 mx-auto flex max-w-2xl flex-col gap-2 rounded-[var(--radius-lg)] border border-white/15 bg-black/80 p-2 backdrop-blur-md sm:left-4 sm:right-auto"
    >
      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs font-medium text-white/80">Pick a key photo</span>
        <button
          type="button"
          className="rounded-[var(--radius)] bg-white/10 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onApply}
          disabled={selected === null || applying}
        >
          {applying ? "Applying…" : "Set as key photo"}
        </button>
        <button
          type="button"
          aria-label="Close frames"
          className="grid size-7 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          <XIcon aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(frames ?? []).map((frame) => {
          const isActive = selected !== null && Math.abs(selected - frame.offset) < 0.001;
          return (
            <button
              key={frame.offset}
              type="button"
              onClick={() => onSelect(frame.offset)}
              aria-pressed={isActive}
              aria-label={`Frame at ${frame.offset.toFixed(2)}s`}
              className={`h-14 flex-shrink-0 overflow-hidden rounded-[var(--radius-sm)] border-2 transition-transform ${
                isActive ? "border-[var(--primary)]" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.url} alt="" className="h-full w-auto" />
            </button>
          );
        })}
        {frames === null ? (
          <span className="px-2 py-4 text-xs text-white/60">Extracting frames…</span>
        ) : null}
      </div>
    </div>
  );
}

/** Decodes the clip offscreen and captures evenly spaced JPEG frames. */
async function extractFrames(motionUrl: string): Promise<LiveFrame[]> {
  const video = document.createElement("video");
  video.src = motionUrl;
  video.muted = true;
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("metadata timeout")), SEEK_TIMEOUT_MS * 2);
    video.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    video.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("clip failed to load"));
    };
  });

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 3;
  const height = 72;
  const width = Math.max(24, Math.round(height * ((video.videoWidth || 1) / (video.videoHeight || 1))));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");

  const count = Math.max(4, Math.min(14, Math.round(duration / 0.25)));
  const frames: LiveFrame[] = [];
  for (let i = 0; i < count; i++) {
    const offset = Math.min(Math.max(0, duration - 0.05), (duration * i) / count);
    await seekTo(video, offset);
    ctx.drawImage(video, 0, 0, width, height);
    frames.push({ offset, url: canvas.toDataURL("image/jpeg", 0.72) });
  }
  return frames;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("seek timeout"));
    }, SEEK_TIMEOUT_MS);
    const onSeeked = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = time;
  });
}

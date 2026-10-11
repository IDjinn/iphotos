"use client";

import { useState } from "react";
import { CheckIcon, CircleIcon, Disc2Icon, PlayIcon } from "lucide-react";
import type { CloudPhoto } from "@/data/cloud-photos-repository";
import { formatDuration } from "@/lib/format";
import { AuthImage } from "@/components/media/auth-image";
import { CellBadge, CellButton, CellWrap, LiveBadge, SelectButton, VideoBadge } from "./gallery.styles";

interface PhotoCellProps {
  photo: CloudPhoto;
  /** Measured cell size in px (square cells). */
  size: number;
  selected: boolean;
  onOpen: () => void;
  onToggleSelect: () => void;
}

export function PhotoCell({ photo, size, selected, onOpen, onToggleSelect }: PhotoCellProps) {
  const [hovered, setHovered] = useState(false);
  const notReady = photo.state !== "Ready";
  const isVideo = photo.mediaType === "Video";

  return (
    <CellWrap
      style={{ width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CellButton
        onClick={onOpen}
        aria-label={`Open ${photo.fileName}`}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <AuthImage photo={photo} fill />
      </CellButton>
      <SelectButton
        $selected={selected}
        $visible={hovered || selected}
        aria-pressed={selected}
        aria-label={selected ? `Deselect ${photo.fileName}` : `Select ${photo.fileName}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect();
        }}
      >
        {selected ? (
          <CheckIcon aria-hidden className="size-4" />
        ) : (
          <CircleIcon aria-hidden className="size-4" />
        )}
      </SelectButton>
      {photo.state === "Failed" ? (
        <CellBadge>Couldn&apos;t process</CellBadge>
      ) : notReady ? (
        <CellBadge>Processing…</CellBadge>
      ) : isVideo ? (
        <VideoBadge>
          <PlayIcon aria-hidden fill="currentColor" />
          {photo.durationSeconds ? formatDuration(photo.durationSeconds) : null}
        </VideoBadge>
      ) : photo.isLive ? (
        <LiveBadge aria-label="Live Photo">
          <Disc2Icon aria-hidden />
        </LiveBadge>
      ) : null}
    </CellWrap>
  );
}

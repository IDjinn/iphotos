"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MonthRailBubble, MonthRailThumb, MonthRailTrack } from "./gallery.styles";

export interface MonthRailMonth {
  /** "yyyy-MM", or "" for photos without a taken date (timeline end). */
  month: string;
  label: string;
  /** First grid row of the month (small values are loaded in the grid). */
  row: number;
  /** Cumulative photo fraction where the month starts (0..1). */
  fraction: number;
}

interface MonthRailProps {
  /** Timeline months in display order, with start fractions by photo count. */
  months: MonthRailMonth[];
  /** Rows currently loaded in the virtualized grid. */
  rowCount: number;
  scrollElement: HTMLDivElement | null;
  scrollToRow: (row: number) => void;
  /** Release/keyboard landed on a month that isn't loaded — filter to it. */
  onJumpToMonth: (month: string) => void;
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });

/** Label for a bucket key: "2026-08" → "August 2026"; "" → "Undated". */
export function monthBucketLabel(month: string): string {
  if (!month) return "Undated";
  const [year, m] = month.split("-").map(Number);
  return MONTH_FORMAT.format(new Date(year, m - 1, 1));
}

/**
 * Google-Photos-style month rail for the gallery: a draggable right-edge
 * thumb with a month bubble; release snaps to the month under it (scrolls
 * when the month is loaded, filters the gallery to it otherwise).
 */
export function MonthRail({ months, rowCount, scrollElement, scrollToRow, onJumpToMonth }: MonthRailProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [active, setActive] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const positionThumb = useCallback((progress: number) => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;
    const travel = Math.max(0, track.clientHeight - thumb.offsetHeight);
    const clamped = Math.min(1, Math.max(0, progress));
    thumb.style.transform = `translateY(${clamped * travel}px)`;
    if (bubbleRef.current) {
      bubbleRef.current.style.transform = `translateY(${clamped * travel + thumb.offsetHeight / 2}px)`;
    }
  }, []);

  const monthAt = useCallback(
    (progress: number): MonthRailMonth => {
      let result = months[0];
      for (const entry of months) {
        if (entry.fraction <= progress) result = entry;
        else break;
      }
      return result;
    },
    [months],
  );

  // Mirror the grid scroll position onto the thumb (drag takes over while held).
  useEffect(() => {
    if (!scrollElement) return;
    const update = () => {
      if (draggingRef.current) return;
      const max = scrollElement.scrollHeight - scrollElement.clientHeight;
      positionThumb(max > 0 ? scrollElement.scrollTop / max : 0);
    };
    update();
    scrollElement.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scrollElement);
    return () => {
      scrollElement.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollElement, positionThumb]);

  const progressFromEvent = (track: HTMLDivElement, clientY: number): number => {
    const rect = track.getBoundingClientRect();
    const thumbHeight = thumbRef.current?.offsetHeight ?? 0;
    const travel = Math.max(1, rect.height - thumbHeight);
    return Math.min(1, Math.max(0, (clientY - rect.top - thumbHeight / 2) / travel));
  };

  const jumpTo = (target: MonthRailMonth) => {
    if (target.row < rowCount) scrollToRow(target.row);
    else onJumpToMonth(target.month);
  };

  return (
    <MonthRailTrack
      ref={trackRef}
      role="slider"
      aria-label="Fast scroll by month"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, months.length - 1)}
      aria-valuenow={Math.min(focusIndex, months.length - 1)}
      aria-valuetext={months[Math.min(focusIndex, months.length - 1)]?.label}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        draggingRef.current = true;
        setActive(true);
        const progress = progressFromEvent(event.currentTarget, event.clientY);
        positionThumb(progress);
        setBubble(monthAt(progress).label);
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        const progress = progressFromEvent(event.currentTarget, event.clientY);
        positionThumb(progress);
        setBubble(monthAt(progress).label);
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setActive(false);
        setBubble(null);
        jumpTo(monthAt(progressFromEvent(event.currentTarget, event.clientY)));
      }}
      onKeyDown={(event) => {
        const delta =
          event.key === "ArrowDown" || event.key === "ArrowRight"
            ? 1
            : event.key === "ArrowUp" || event.key === "ArrowLeft"
              ? -1
              : 0;
        if (delta !== 0) {
          event.preventDefault();
          const index = Math.min(months.length - 1, Math.max(0, focusIndex + delta));
          setFocusIndex(index);
          jumpTo(months[index]);
          return;
        }
        if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const index = event.key === "Home" ? 0 : months.length - 1;
          setFocusIndex(index);
          jumpTo(months[index]);
        }
      }}
    >
      <MonthRailBubble ref={bubbleRef} $visible={bubble !== null}>
        {bubble}
      </MonthRailBubble>
      <MonthRailThumb ref={thumbRef} $active={active} />
    </MonthRailTrack>
  );
}

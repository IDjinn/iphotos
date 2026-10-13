import { useEffect, useState } from 'react';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';

import { FaceStrip } from '@/components/people/FaceStrip';
import type { PersonSuggestion } from '@/data/people-repository';
import { Durations } from '@/theme/tokens';

/** How long each suggestion's faces stay before cross-fading to the next —
 * an ambient rotation period, not a UI transition (the fade itself is
 * `Durations.normal`). */
const CYCLE_MS = 3500;

interface CyclingFaceStripProps {
  suggestions: PersonSuggestion[];
  size?: number;
}

/** Rotating preview for the review row: each pending suggestion's overlapping
 * faces in turn, cross-fading every few seconds (opacity only; static under
 * reduced motion or with a single suggestion). */
export function CyclingFaceStrip({ suggestions, size = 28 }: CyclingFaceStripProps) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reducedMotion || suggestions.length < 2) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % suggestions.length);
    }, CYCLE_MS);
    return () => clearInterval(timer);
  }, [reducedMotion, suggestions.length]);

  const suggestion = suggestions[Math.min(index, suggestions.length - 1)];
  if (!suggestion) {
    return null;
  }

  const faces = [
    suggestion.coverFaceId,
    ...suggestion.faceIds.filter((id) => id !== suggestion.coverFaceId),
  ];

  return (
    <Animated.View key={suggestion.id} entering={FadeIn.duration(Durations.normal)}>
      <FaceStrip faceIds={faces} max={3} total={suggestion.faceCount} size={size} />
    </Animated.View>
  );
}

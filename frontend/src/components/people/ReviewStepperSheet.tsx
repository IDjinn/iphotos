import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useTranslation } from '@/i18n/hook';
import { ReviewButton } from '@/components/people/ReviewButton';
import { FaceAvatar } from '@/components/people/FaceAvatar';
import {
  Description,
  Figure,
  FigureLabel,
  FigureMeta,
  FigureName,
  FiguresRow,
  Footer,
  ProgressLabel,
  ProgressTrack,
  SheetHeading,
  SheetHeader,
  TrackFill,
} from '@/components/people/ReviewStepperSheet.styles';

export type ReviewMode = 'faces' | 'group';

export interface StepperItem {
  /** The id a verdict is recorded against (face id in faces mode, person id in group mode). */
  id: string;
  /** Face crop shown as the candidate figure. */
  faceId: string | null;
  /** Caption under the candidate figure. */
  caption: string;
  /** Trailing meta line (group mode: "N faces · X% match"). */
  meta?: string;
}

export interface StepperVerdict {
  accepted: string[];
  rejected: string[];
  unsure: string[];
}

interface ReviewStepperSheetProps {
  visible: boolean;
  /** Pure cancel — verdicts recorded so far are dropped, like the web dialog. */
  onClose: () => void;
  mode: ReviewMode;
  reference: { faceId: string | null; name: string };
  items: StepperItem[];
  busy: boolean;
  /** Fires on the last verdict with everything recorded so far. */
  onFinish: (verdict: StepperVerdict) => void;
}

/** One-by-one "is this the same person?" review (doc 18 §7.4, web parity):
 * the reference figure beside each candidate, one verdict per step, progress
 * counter + bar. Faces mode records accept / reject / unsure per face; group
 * mode only accept (skip records nothing). */
export function ReviewStepperSheet({
  visible,
  onClose,
  mode,
  reference,
  items,
  busy,
  onFinish,
}: ReviewStepperSheetProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [accepted, setAccepted] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const [unsure, setUnsure] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      setAccepted([]);
      setRejected([]);
      setUnsure([]);
    }
  }, [visible]);

  const total = items.length;
  const step = items[stepIndex];

  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    const target = total > 0 ? Math.min(1, stepIndex / total) : 0;
    progress.value = reducedMotion
      ? target
      : withTiming(target, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [stepIndex, total, reducedMotion, progress]);
  const fillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(progress.value, 0.001) }],
  }));

  if (!visible || total === 0 || !step) return null;

  const advance = (verdict: 'accept' | 'reject' | 'defer' | 'skip') => {
    const id = step.id;
    if (verdict === 'accept') setAccepted((prev) => [...prev, id]);
    if (verdict === 'reject') setRejected((prev) => [...prev, id]);
    if (verdict === 'defer') setUnsure((prev) => [...prev, id]);
    // 'skip' records nothing (group mode) — the member stays untouched.

    if (stepIndex + 1 < total) {
      setStepIndex(stepIndex + 1);
      return;
    }
    onFinish({
      accepted: verdict === 'accept' ? [...accepted, id] : accepted,
      rejected: verdict === 'reject' ? [...rejected, id] : rejected,
      unsure: verdict === 'defer' ? [...unsure, id] : unsure,
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <SheetHeader>
        <SheetHeading variant="titleMedium">{t('suggestion.stepperTitle')}</SheetHeading>
        <Pressable
          hitSlop={12}
          onPress={onClose}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Icon name="close" size={22} />
        </Pressable>
      </SheetHeader>
      <Description variant="bodySmall" color="secondary">
        {mode === 'faces'
          ? t('suggestion.stepperFacesDescription')
          : t('suggestion.stepperGroupDescription')}
      </Description>

      <FiguresRow>
        <Figure>
          <FaceAvatar faceId={reference.faceId} size={120} label={reference.name} />
          <FigureLabel variant="label" color="secondary">
            {t('suggestion.referenceLabel')}
          </FigureLabel>
          <FigureName variant="bodySmall" numberOfLines={2}>
            {reference.name}
          </FigureName>
        </Figure>
        <Figure>
          <FaceAvatar faceId={step.faceId} size={120} label={step.caption} />
          <FigureLabel variant="label" color="secondary">
            {t('suggestion.candidateLabel')}
          </FigureLabel>
          <FigureName variant="bodySmall" numberOfLines={2}>
            {step.caption}
          </FigureName>
          {step.meta ? (
            <FigureMeta variant="bodySmall" color="secondary" numberOfLines={2}>
              {step.meta}
            </FigureMeta>
          ) : null}
        </Figure>
      </FiguresRow>

      <ProgressLabel variant="bodySmall" color="secondary">
        {t('suggestion.stepperProgress', { current: stepIndex + 1, total })}
      </ProgressLabel>
      <ProgressTrack>
        <TrackFill style={fillStyle} />
      </ProgressTrack>

      <Footer>
        {mode === 'faces' ? (
          <ReviewButton
            variant="ghost"
            icon="help-circle-outline"
            label={t('suggestion.notSure')}
            disabled={busy}
            onPress={() => advance('defer')}
          />
        ) : null}
        <ReviewButton
          variant="outline"
          icon="close"
          destructive={mode === 'faces'}
          label={mode === 'faces' ? t('suggestion.notSame') : t('suggestion.skip')}
          disabled={busy}
          onPress={() => (mode === 'faces' ? advance('reject') : advance('skip'))}
        />
        <ReviewButton
          icon="git-merge-outline"
          label={mode === 'faces' ? t('suggestion.samePerson') : t('suggestion.samePersonMerge')}
          busyLabel={mode === 'faces' ? t('suggestion.adding') : t('suggestion.merging')}
          busy={busy}
          onPress={() => advance('accept')}
        />
      </Footer>
    </BottomSheet>
  );
}

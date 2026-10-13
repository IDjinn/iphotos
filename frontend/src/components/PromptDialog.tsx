import { useState } from 'react';
import { Modal } from 'react-native';
import { FadeIn, ZoomIn } from 'react-native-reanimated';

import {
  ActionBase,
  ActionLabel,
  ActionPressable,
  Actions,
  Backdrop,
  BackdropPressable,
  Body,
  Card,
  Root,
  Sheen,
  Title,
} from '@/components/ConfirmDialog.styles';
import { Input } from '@/components/PromptDialog.styles';
import { PressableScale } from '@/components/PressableScale';
import { useTheme } from '@/theme/context';

interface PromptDialogProps {
  visible: boolean;
  title: string;
  /** Seeds the input every time the dialog opens. */
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  maxLength?: number;
  /** Receives the (untrimmed) draft — the caller decides what is valid. */
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * In-app single-field prompt styled as the ConfirmDialog's liquid-glass card.
 * Dismisses via Cancel, backdrop tap, or Android hardware back; Enter submits.
 */
export function PromptDialog({
  visible,
  title,
  initialValue = '',
  placeholder,
  confirmLabel,
  cancelLabel,
  maxLength,
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(initialValue);
  const [wasVisible, setWasVisible] = useState(false);
  // Render-phase reseed: each open starts from the caller's initial value.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    setDraft(initialValue);
  }

  const submit = () => {
    onConfirm(draft);
  };

  return (
    <Modal visible={visible} transparent statusBarTranslucent onRequestClose={onCancel}>
      {visible ? (
        <Root pointerEvents="box-none" entering={FadeIn.duration(160)}>
          <Backdrop entering={FadeIn.duration(160)}>
            <BackdropPressable onPress={onCancel} accessibilityLabel={cancelLabel} />
          </Backdrop>
          <Card entering={ZoomIn.springify().dampingRatio(0.85).stiffness(260)}>
            <Sheen />
            <Body>
              <Title variant="titleMedium">{title}</Title>
              <Input
                autoFocus
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={colors.textDisabled}
                maxLength={maxLength}
                onSubmitEditing={submit}
                submitBehavior="submit"
              />
            </Body>
            <Actions>
              <ActionBase>
                <PressableScale onPress={onCancel} accessibilityRole="button" accessibilityLabel={cancelLabel}>
                  <ActionPressable $destructive={false}>
                    <ActionLabel variant="body" $destructive={false}>
                      {cancelLabel}
                    </ActionLabel>
                  </ActionPressable>
                </PressableScale>
              </ActionBase>
              <ActionBase>
                <PressableScale onPress={submit} accessibilityRole="button" accessibilityLabel={confirmLabel}>
                  <ActionPressable $destructive={false}>
                    <ActionLabel variant="body" $destructive={false}>
                      {confirmLabel}
                    </ActionLabel>
                  </ActionPressable>
                </PressableScale>
              </ActionBase>
            </Actions>
          </Card>
        </Root>
      ) : null}
    </Modal>
  );
}

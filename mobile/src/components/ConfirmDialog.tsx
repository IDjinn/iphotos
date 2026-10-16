import { Modal } from 'react-native';
import { ZoomIn, FadeIn } from 'react-native-reanimated';

import {
  ActionBase,
  ActionLabel,
  ActionPressable,
  Actions,
  Backdrop,
  BackdropPressable,
  Body,
  Card,
  Message,
  Root,
  Sheen,
  Title,
} from '@/components/ConfirmDialog.styles';
import { PressableScale } from '@/components/PressableScale';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Renders the confirm action as the destructive (danger-filled) button. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * In-app confirmation dialog styled as a liquid-glass card: translucent
 * fill, highlight border, spring scale entrance. Dismisses via Cancel,
 * backdrop tap, or Android hardware back.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
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
            {message ? (
              <Message variant="bodySmall" color="secondary">
                {message}
              </Message>
            ) : null}
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
              <PressableScale onPress={onConfirm} accessibilityRole="button" accessibilityLabel={confirmLabel}>
                <ActionPressable $destructive={destructive}>
                  <ActionLabel variant="body" $destructive={destructive}>
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

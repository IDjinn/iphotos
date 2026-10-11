import { ActivityIndicator } from 'react-native';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  ButtonLabel,
  ButtonShell,
  type ReviewButtonVariant,
} from '@/components/people/ReviewButton.styles';
import { useTheme } from '@/theme/context';

interface ReviewButtonProps {
  label: string;
  /** Swapped in while `busy`, next to a spinner. */
  busyLabel?: string;
  variant?: ReviewButtonVariant;
  icon?: IconName;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}

/** The review UI's button (doc 18 §7.4 banners, stepper and suggestion cards):
 * filled / outlined / text-only variants with a shared busy state. */
export function ReviewButton({
  label,
  busyLabel,
  variant = 'primary',
  icon,
  destructive = false,
  disabled = false,
  busy = false,
  onPress,
}: ReviewButtonProps) {
  const { colors } = useTheme();
  const controlColor = destructive
    ? colors.danger
    : variant === 'primary'
      ? colors.onAccent
      : variant === 'outline'
        ? colors.accent
        : colors.textSecondary;

  return (
    <ButtonShell
      variant={variant}
      $destructive={destructive}
      $disabled={disabled || busy}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={controlColor} />
      ) : icon ? (
        <Icon name={icon} size={16} color={controlColor} />
      ) : null}
      <ButtonLabel variant="bodySmall" $variant={variant} $destructive={destructive}>
        {busy && busyLabel ? busyLabel : label}
      </ButtonLabel>
    </ButtonShell>
  );
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import {
  ActionButton,
  Actions,
  Count,
  CountPill,
  Exit,
  Wrap,
} from '@/components/SelectionBar.styles';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface SelectionAction {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface SelectionBarProps {
  count: number;
  onExit: () => void;
  actions: SelectionAction[];
}

/**
 * Floating action bar shown while multi-select is active.
 * Slides up with a spring, count pill on the left.
 */
export function SelectionBar({ count, onExit, actions }: SelectionBarProps) {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Wrap
      entering={FadeInDown.springify().dampingRatio(0.8)}
      exiting={FadeOutDown.duration(160)}
      $bottom={insets.bottom + space[14]}
    >
      <Exit onPress={onExit} accessibilityLabel="Exit selection">
        <Icon name="close" size={20} color={colors.textSecondary} />
      </Exit>
      <CountPill>
        <Count variant="bodySmall" color="accent">
          {count}
        </Count>
      </CountPill>
      <Actions>
        {actions.map((action) => (
          <ActionButton
            key={action.label}
            accessibilityLabel={action.label}
            onPress={() => {
              haptic('light');
              action.onPress();
            }}
          >
            <Icon name={action.icon} size={22} color={action.destructive ? colors.danger : colors.icon} />
          </ActionButton>
        ))}
      </Actions>
    </Wrap>
  );
}

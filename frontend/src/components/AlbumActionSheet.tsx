import { useState } from 'react';

import { BottomSheet } from '@/components/BottomSheet';
import { Icon } from '@/components/Icon';
import { ActionLabel, ActionRow, Heading } from '@/components/AlbumActionSheet.styles';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface AlbumActionSheetProps {
  visible: boolean;
  albumTitle: string;
  renameLabel: string;
  deleteLabel: string;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/**
 * Long-press menu for an album (Library tab): rename + delete actions
 * on a bottom sheet, replacing the old native Alert menu.
 */
export function AlbumActionSheet({
  visible,
  albumTitle,
  renameLabel,
  deleteLabel,
  onClose,
  onRename,
  onDelete,
}: AlbumActionSheetProps) {
  const { colors } = useTheme();
  const [pressed, setPressed] = useState<'rename' | 'delete' | null>(null);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeightFactor={0.4}>
      <Heading variant="titleMedium" numberOfLines={1}>
        {albumTitle}
      </Heading>
      <ActionRow
        $pressed={pressed === 'rename'}
        onPressIn={() => setPressed('rename')}
        onPressOut={() => setPressed(null)}
        onPress={() => {
          haptic('light');
          onRename();
        }}
        accessibilityRole="button"
        accessibilityLabel={renameLabel}
      >
        <Icon name="create-outline" size={20} color={colors.text} />
        <ActionLabel variant="body" $danger={false}>
          {renameLabel}
        </ActionLabel>
        <Icon name="chevron-forward" size={16} color={colors.textDisabled} />
      </ActionRow>
      <ActionRow
        $pressed={pressed === 'delete'}
        onPressIn={() => setPressed('delete')}
        onPressOut={() => setPressed(null)}
        onPress={() => {
          haptic('light');
          onDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
      >
        <Icon name="trash-outline" size={20} color={colors.danger} />
        <ActionLabel variant="body" $danger>
          {deleteLabel}
        </ActionLabel>
      </ActionRow>
    </BottomSheet>
  );
}

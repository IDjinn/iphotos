import { useCallback } from 'react';
import { Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CloudPhotoGrid } from '@/components/CloudPhotoGrid';
import { Icon } from '@/components/Icon';
import {
  GridArea,
  Header,
  HeaderSpacer,
  HeaderTitle,
  Screen,
} from '@/screens/label/[label].styles';
import { listLabelPhotos } from '@/data/cloud-labels-repository';
import { useTranslation } from '@/i18n/hook';

/**
 * All photos carrying one scene label (doc 18 §10) — the read side returns
 * after the mobile labeling removal, now backed by the backend vision labels.
 */
export default function LabelScreen() {
  const { label } = useLocalSearchParams<{ label: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const fetchPage = useCallback(
    (page: number, pageSize: number) => listLabelPhotos(label, page, pageSize),
    [label],
  );

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium" numberOfLines={1}>
          {label}
        </HeaderTitle>
        <HeaderSpacer />
      </Header>
      <GridArea>
        <CloudPhotoGrid fetchPage={fetchPage} refreshToken={0} />
      </GridArea>
    </Screen>
  );
}

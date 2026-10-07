import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { CloudGallery } from '@/components/CloudGallery';
import { Icon } from '@/components/Icon';
import { Header, HeaderSpacer, HeaderTitle, Screen } from '@/app/cloud-photos.styles';
import { useTranslation } from '@/i18n/hook';
import { useTheme } from '@/theme/context';

/**
 * Cloud photo browser: every photo backed by the backend, with delete,
 * download and processing-state badges. The grid itself lives in
 * `CloudGallery` (shared with the Photos tab in Expo Go).
 */
export default function CloudPhotosScreen() {
  const { space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen $insetTop={insets.top + space[2]}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('cloudPhotos.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      <CloudGallery contentContainerStyle={{ paddingBottom: insets.bottom + space[6] }} />
    </Screen>
  );
}

import { useTranslation } from '@/i18n/hook';
import { isOfflineNow, useIsOffline } from '@/hooks/use-net-info';
import { BannerWrap } from '@/components/OfflineBanner.styles';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';

/**
 * Persistent "you're offline" notice for cloud-backed screens. Renders null
 * while connected; the flag is read once synchronously so a screen mounting
 * already offline shows the banner on first paint.
 */
export function OfflineBanner(): React.ReactNode {
  if (!isOfflineNow()) return null;
  return <OfflineBannerInner />;
}

function OfflineBannerInner(): React.ReactNode {
  const offline = useIsOffline();
  const { t } = useTranslation();
  const { colors } = useTheme();
  if (!offline) return null;
  return (
    <BannerWrap accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Icon name="cloud-offline-outline" size={16} color={colors.textSecondary} />
      <ThemedText variant="bodySmall" color="secondary">
        {t('cloud.offlineBanner')}
      </ThemedText>
    </BannerWrap>
  );
}

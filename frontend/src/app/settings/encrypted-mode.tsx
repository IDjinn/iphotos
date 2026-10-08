import { useCallback, useEffect, useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Alert, Pressable, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Field,
  GridWrap,
  Header,
  HeaderInset,
  HeaderSpacer,
  HeaderTitle,
  Intro,
  IntroText,
  IntroTitle,
  PrimaryButton,
  PrimaryButtonLabel,
  Screen,
  StatusRow,
  StatusText,
  StatusTitle,
  TextButton,
} from '@/screens/settings/encrypted-mode.styles';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { loadEncryptedGridAssets, resolveEncryptedOriginal } from '@/data/encrypted-mode-repository';
import { isEncryptedModeSupported } from '@/data/encrypted-crypto';
import type { PhotoAsset } from '@/data/types';
import { useEncryptedModeStore } from '@/stores/encrypted-mode';
import { useViewerStore } from '@/stores/viewer';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/**
 * Encrypted offline mode (docs/plans/13-encrypted-mode.md): removes the photo
 * library from the system gallery and keeps it encrypted locally behind a
 * password. Browsing uses decrypted previews; originals decrypt on demand.
 */
export default function EncryptedModeScreen() {
  const { colors, space } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supported = isEncryptedModeSupported();
  const enabled = useEncryptedModeStore((s) => s.enabled);
  const unlocked = useEncryptedModeStore((s) => s.unlocked);
  const migrating = useEncryptedModeStore((s) => s.migrating);
  const progress = useEncryptedModeStore((s) => s.progress);
  const lastError = useEncryptedModeStore((s) => s.lastError);
  const refresh = useEncryptedModeStore((s) => s.refresh);
  const enableMode = useEncryptedModeStore((s) => s.enable);
  const unlockMode = useEncryptedModeStore((s) => s.unlock);
  const lockNow = useEncryptedModeStore((s) => s.lock);
  const disableMode = useEncryptedModeStore((s) => s.disable);
  const mode = {
    enabled,
    unlocked,
    migrating,
    progress,
    lastError,
    refresh,
    enable: enableMode,
    unlock: unlockMode,
    lock: lockNow,
    disable: disableMode,
  };
  const openViewer = useViewerStore((s) => s.open);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Load the preview grid whenever the session is unlocked.
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    void loadEncryptedGridAssets().then((loaded) => {
      if (!cancelled) setAssets(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const onCellPress = useCallback(
    (asset: PhotoAsset) => {
      haptic('light');
      void resolveEncryptedOriginal(asset.id)
        .then((uri) => {
          const index = assets.findIndex((a) => a.id === asset.id);
          if (index < 0) return;
          const viewerAssets = assets.map((a) => (a.id === asset.id ? { ...a, uri } : a));
          openViewer(viewerAssets, index, 'gallery');
        })
        .catch(() => {
          Alert.alert('Encrypted mode', 'Could not decrypt this photo.');
        });
    },
    [assets, openViewer]
  );

  const enable = async () => {
    if (password.length < 4) {
      Alert.alert('Encrypted mode', 'Choose a password with at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Encrypted mode', 'The passwords do not match.');
      return;
    }
    setBusy(true);
    const ok = await mode.enable(password);
    setBusy(false);
    setPassword('');
    setConfirmPassword('');
    if (ok) router.replace('/');
  };

  const unlock = async () => {
    setBusy(true);
    await mode.unlock(password);
    setBusy(false);
    setPassword('');
  };

  const disable = () => {
    if (password.length < 4) {
      Alert.alert('Encrypted mode', 'Enter your password to restore your photos.');
      return;
    }
    Alert.alert(
      'Disable encrypted mode?',
      'Every photo will be decrypted back into the system gallery. This can take a while.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disable',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            void mode.disable(password).then((ok) => {
              setBusy(false);
              setPassword('');
              if (ok) router.back();
            });
          },
        },
      ]
    );
  };

  const progressPercent =
    mode.progress && mode.progress.total > 0
      ? Math.min(
          100,
          Math.floor(((mode.progress.processed + mode.progress.failed) / mode.progress.total) * 100)
        )
      : null;

  // Shared scroll content padding/gap (same on every state branch).
  const contentBody: ViewStyle = { width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', padding: space[5], gap: space[3] };

  return (
    <Screen>
      <HeaderInset $insetTop={insets.top + space[2]}>
        <Header>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium">Encrypted mode</HeaderTitle>
          <HeaderSpacer />
        </Header>
      </HeaderInset>

      {!supported ? (
        <Body contentContainerStyle={contentBody}>
          <Intro entering={FadeInDown.duration(200)}>
            <Icon name="lock-closed-outline" size={28} color={colors.textDisabled} />
            <IntroTitle variant="body">Not available here</IntroTitle>
            <IntroText variant="bodySmall" color="secondary">
              Encrypted mode needs the native crypto module, which the Expo Go preview client does
              not include. Run a development build (expo run:android) to use it.
            </IntroText>
          </Intro>
        </Body>
      ) : mode.migrating || busy ? (
        <Body contentContainerStyle={contentBody}>
          <ActivityIndicator size="large" color={colors.accent} />
          <StatusTitle variant="body">
            {mode.progress?.phase === 'decrypting' ? 'Restoring your photos…' : 'Encrypting your photos…'}
          </StatusTitle>
          {progressPercent !== null ? (
            <ThemedText variant="bodySmall" color="secondary">
              {progressPercent}% · {mode.progress!.processed + mode.progress!.failed} of {mode.progress!.total}
            </ThemedText>
          ) : (
            <ThemedText variant="bodySmall" color="secondary">
              Keep the app open until this finishes.
            </ThemedText>
          )}
        </Body>
      ) : !mode.enabled ? (
        <Body contentContainerStyle={contentBody}>
          <Intro entering={FadeInDown.duration(200)}>
            <Icon name="lock-closed-outline" size={28} color={colors.accent} />
            <IntroTitle variant="body">Encrypt your photos on this device</IntroTitle>
            <IntroText variant="bodySmall" color="secondary">
              Your photos are removed from the system gallery and stored encrypted (AES-256). Browse
              them inside the app with small previews; opening a photo asks for your password and
              decrypts it only for that session. Photos only for now — videos stay untouched.
            </IntroText>
            <Field
              placeholder="Password"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Field
              placeholder="Repeat password"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
            {mode.lastError ? (
              <ThemedText variant="bodySmall" color="danger">
                {mode.lastError}
              </ThemedText>
            ) : null}
            <AccentButton onPress={() => void enable()} accessibilityLabel="Enable encrypted mode" label="Encrypt my photos" />
          </Intro>
        </Body>
      ) : !mode.unlocked ? (
        <Body contentContainerStyle={contentBody}>
          <Intro entering={FadeInDown.duration(200)}>
            <Icon name="lock-closed-outline" size={28} color={colors.accent} />
            <IntroTitle variant="body">Your photos are encrypted</IntroTitle>
            <IntroText variant="bodySmall" color="secondary">
              Enter your password to browse them. The password is not recoverable — without it the
              photos cannot be decrypted.
            </IntroText>
            <Field
              placeholder="Password"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {mode.lastError ? (
              <ThemedText variant="bodySmall" color="danger">
                {mode.lastError}
              </ThemedText>
            ) : null}
            <AccentButton onPress={() => void unlock()} accessibilityLabel="Unlock encrypted photos" label="Unlock" />
            <TextButton onPress={disable} accessibilityLabel="Disable encrypted mode">
              <ThemedText variant="bodySmall" color="secondary">
                Disable encrypted mode (decrypt everything back)
              </ThemedText>
            </TextButton>
          </Intro>
        </Body>
      ) : (
        <GridWrap>
          <StatusRow>
            <StatusText variant="bodySmall" color="secondary">
              Unlocked · {assets.length} encrypted photo{assets.length === 1 ? '' : 's'}
            </StatusText>
            <Pressable
              hitSlop={8}
              onPress={() => {
                haptic('medium');
                mode.lock();
              }}
              accessibilityLabel="Lock encrypted photos"
            >
              <ThemedText variant="bodySmall" color="accent">
                Lock
              </ThemedText>
            </Pressable>
          </StatusRow>
          <PhotoGrid assets={unlocked ? assets : []} context="gallery" onCellPress={onCellPress} stickyMonths={false} />
        </GridWrap>
      )}
    </Screen>
  );
}

/** Accent action button with pressed feedback. */
function AccentButton({
  onPress,
  label,
  accessibilityLabel,
}: {
  onPress: () => void;
  label: string;
  accessibilityLabel: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <PrimaryButton
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        haptic('light');
        onPress();
      }}
      accessibilityLabel={accessibilityLabel}
    >
      <PrimaryButtonLabel variant="body">{label}</PrimaryButtonLabel>
    </PrimaryButton>
  );
}

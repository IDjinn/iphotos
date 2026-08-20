import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { loadEncryptedGridAssets, resolveEncryptedOriginal } from '@/data/encrypted-mode-repository';
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
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top + 8 }}>
        <View style={styles.header}>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Back">
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <ThemedText variant="titleMedium" style={styles.headerTitle}>
            Encrypted mode
          </ThemedText>
          <View style={{ width: 24 }} />
        </View>
      </View>

      {mode.migrating || busy ? (
        <ScrollView contentContainerStyle={styles.body}>
          <ActivityIndicator size="large" color={colors.accent} />
          <ThemedText variant="body" style={styles.statusTitle}>
            {mode.progress?.phase === 'decrypting' ? 'Restoring your photos…' : 'Encrypting your photos…'}
          </ThemedText>
          {progressPercent !== null ? (
            <ThemedText variant="bodySmall" color="secondary">
              {progressPercent}% · {mode.progress!.processed + mode.progress!.failed} of {mode.progress!.total}
            </ThemedText>
          ) : (
            <ThemedText variant="bodySmall" color="secondary">
              Keep the app open until this finishes.
            </ThemedText>
          )}
        </ScrollView>
      ) : !mode.enabled ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(200)} style={styles.intro}>
            <Icon name="lock-closed-outline" size={28} color={colors.accent} />
            <ThemedText variant="body" style={styles.introTitle}>
              Encrypt your photos on this device
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.introText}>
              Your photos are removed from the system gallery and stored encrypted (AES-256). Browse
              them inside the app with small previews; opening a photo asks for your password and
              decrypts it only for that session. Photos only for now — videos stay untouched.
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.outline }]}
              placeholder="Password"
              placeholderTextColor={colors.textDisabled}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.outline }]}
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
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
              onPress={() => void enable()}
              accessibilityLabel="Enable encrypted mode"
            >
              <ThemedText variant="body" style={styles.buttonLabel}>
                Encrypt my photos
              </ThemedText>
            </Pressable>
          </Animated.View>
        </ScrollView>
      ) : !mode.unlocked ? (
        <ScrollView contentContainerStyle={styles.body}>
          <Animated.View entering={FadeInDown.duration(200)} style={styles.intro}>
            <Icon name="lock-closed-outline" size={28} color={colors.accent} />
            <ThemedText variant="body" style={styles.introTitle}>
              Your photos are encrypted
            </ThemedText>
            <ThemedText variant="bodySmall" color="secondary" style={styles.introText}>
              Enter your password to browse them. The password is not recoverable — without it the
              photos cannot be decrypted.
            </ThemedText>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.outline }]}
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
            <Pressable
              style={({ pressed }) => [styles.button, { backgroundColor: colors.accent }, pressed && { opacity: 0.85 }]}
              onPress={() => void unlock()}
              accessibilityLabel="Unlock encrypted photos"
            >
              <ThemedText variant="body" style={styles.buttonLabel}>
                Unlock
              </ThemedText>
            </Pressable>
            <Pressable style={styles.textButton} onPress={disable} accessibilityLabel="Disable encrypted mode">
              <ThemedText variant="bodySmall" color="secondary">
                Disable encrypted mode (decrypt everything back)
              </ThemedText>
            </Pressable>
          </Animated.View>
        </ScrollView>
      ) : (
        <View style={styles.gridWrap}>
          <View style={[styles.statusRow, { borderBottomColor: colors.outline }]}>
            <ThemedText variant="bodySmall" color="secondary" style={styles.statusText}>
              Unlocked · {assets.length} encrypted photo{assets.length === 1 ? '' : 's'}
            </ThemedText>
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
          </View>
          <PhotoGrid assets={unlocked ? assets : []} context="gallery" onCellPress={onCellPress} stickyMonths={false} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  body: { padding: 20, gap: 14 },
  intro: { gap: 14, alignItems: 'flex-start' },
  introTitle: { fontWeight: '600' },
  introText: { lineHeight: 20 },
  input: { width: '100%', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  button: { borderRadius: 14, paddingHorizontal: 20, paddingVertical: 13, alignSelf: 'stretch', alignItems: 'center' },
  buttonLabel: { color: '#FFFFFF', fontWeight: '600' },
  textButton: { alignSelf: 'center', paddingVertical: 6 },
  statusTitle: { fontWeight: '600' },
  gridWrap: { flex: 1 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statusText: { flex: 1 },
});

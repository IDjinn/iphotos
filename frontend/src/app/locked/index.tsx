import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PinDots, PinPad } from '@/components/PinPad';
import { PressableScale } from '@/components/PressableScale';
import { SelectionBar } from '@/components/SelectionBar';
import { ThemedText } from '@/components/ThemedText';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { fetchAssetsByIds } from '@/data/media-repository';
import { getLockedIdList, readLockedConfig, setupLockedFolder, verifyPin, type LockedFolderConfig } from '@/data/locked-repository';
import { loadVaultGridAssets, migrateLegacyLocked } from '@/data/vault-repository';
import type { PhotoAsset } from '@/data/types';
import { useBulkActions } from '@/hooks/use-bulk-actions';
import { useLibraryStore } from '@/stores/library';
import { useLockedSessionStore } from '@/stores/locked-session';
import { useSelectionStore } from '@/stores/selection';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

const PIN_LENGTH = 4;

type Stage =
  | 'loading'
  | 'setup-intro'
  | 'setup-pin'
  | 'setup-confirm'
  | 'setup-biometric'
  | 'gate'
  | 'gate-pin'
  | 'unlocked';

/**
 * Locked Folder (Pasta Segura): setup flow, biometric/PIN gate and the
 * hidden grid. Re-locks automatically when the app backgrounds.
 */
export default function LockedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('loading');
  const [config, setConfig] = useState<LockedFolderConfig | null>(null);
  const [pin, setPin] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [assets, setAssets] = useState<PhotoAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const unlocked = useLockedSessionStore((s) => s.unlocked);
  const unlockSession = useLockedSessionStore((s) => s.unlock);
  const lockedStamp = useLibraryStore((s) => s.lockedIds.length);
  const selectionActive = useSelectionStore((s) => s.active);
  const selectedCount = useSelectionStore((s) => s.ids.length);

  useEffect(() => {
    void (async () => {
      const [cfg, hasHardware, enrolled] = await Promise.all([
        readLockedConfig(),
        LocalAuthentication.hasHardwareAsync().catch(() => false),
        LocalAuthentication.isEnrolledAsync().catch(() => false),
      ]);
      setConfig(cfg);
      setBiometricAvailable(Boolean(hasHardware && enrolled));
      setStage(!cfg.enabled ? 'setup-intro' : cfg.biometric && hasHardware && enrolled ? 'gate' : 'gate-pin');
    })();
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const [vaultItems, legacyItems] = await Promise.all([
        loadVaultGridAssets(),
        fetchAssetsByIds(getLockedIdList()),
      ]);
      setAssets([...vaultItems, ...legacyItems]);
      setLegacyCount(legacyItems.length);
    } finally {
      setLoading(false);
    }
  }, []);

  const runMigration = () => {
    haptic('medium');
    Alert.alert(
      'Encrypt locked items?',
      `${legacyCount} item${legacyCount === 1 ? '' : 's'} will be encrypted and removed from your device gallery. If you uninstall iPhotos, locked items are deleted permanently.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Encrypt',
          onPress: () => {
            setMigrating(true);
            setMigrateProgress({ done: 0, total: legacyCount });
            void migrateLegacyLocked((done, total) => setMigrateProgress({ done, total }))
              .then(async () => {
                useLibraryStore.getState().refresh();
                await loadAssets();
                setToast('All items are now encrypted');
              })
              .catch(() => setToast('Could not encrypt some items'))
              .finally(() => setMigrating(false));
          },
        },
      ]
    );
  };

  useEffect(() => {
    if (stage === 'unlocked' || (config?.enabled && unlocked)) void loadAssets();
  }, [stage, unlocked, config, loadAssets, lockedStamp]);

  // ----- Setup flow -----
  const startSetup = () => {
    haptic('medium');
    setPin('');
    setFirstPin('');
    setStage('setup-pin');
  };

  const onSetupDigit = (digit: string) => {
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(() => {
        if (stage === 'setup-pin') {
          setFirstPin(next);
          setPin('');
          setStage('setup-confirm');
        } else if (stage === 'setup-confirm') {
          if (next === firstPin) {
            void finalizeSetup(next);
          } else {
            setShakeKey((k) => k + 1);
            setPin('');
            setStage('setup-pin');
            setFirstPin('');
            setToast('PINs did not match — try again');
          }
        }
      }, 120);
    }
  };

  const finalizeSetup = async (finalPin: string) => {
    if (biometricAvailable) {
      setFirstPin(finalPin);
      setStage('setup-biometric');
    } else {
      await setupLockedFolder(finalPin, false);
      setConfig(await readLockedConfig());
      unlockSession();
      haptic('success');
      setStage('unlocked');
    }
  };

  const enableBiometric = async (enable: boolean) => {
    await setupLockedFolder(firstPin, enable);
    setConfig(await readLockedConfig());
    unlockSession();
    haptic('success');
    setStage('unlocked');
  };

  // ----- Gate flow -----
  const tryBiometric = async () => {
    haptic('medium');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock your Locked Folder',
      fallbackLabel: 'Use PIN',
      cancelLabel: 'Cancel',
    }).catch(() => null);
    if (result?.success) {
      unlockSession();
      setStage('unlocked');
    }
  };

  const onGateDigit = (digit: string) => {
    const next = (pin + digit).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      setTimeout(async () => {
        const cfg = config ?? (await readLockedConfig());
        const ok = await verifyPin(next, cfg);
        if (ok) {
          unlockSession();
          setPin('');
          setStage('unlocked');
        } else {
          setShakeKey((k) => k + 1);
          setPin('');
        }
      }, 120);
    }
  };

  const bulk = useBulkActions({
    assets,
    applyRemovals: (ids) => setAssets((prev) => prev.filter((a) => !ids.includes(a.id))),
    lockedContext: true,
  });

  // ----- Render helpers -----
  const shell = (children: React.ReactNode) => (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Icon name="close" size={24} />
        </Pressable>
        <ThemedText variant="titleMedium" style={styles.headerTitle}>
          Locked Folder
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>
      {children}
      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </View>
  );

  if (stage === 'loading') {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (stage === 'setup-intro') {
    return shell(
      <Animated.View entering={FadeInDown.springify().dampingRatio(0.85)} style={styles.flow}>
        <View style={[styles.lockIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Icon name="lock-closed" size={34} color={colors.accent} />
        </View>
        <ThemedText variant="title" style={styles.flowTitle}>
          Set up your Locked Folder
        </ThemedText>
        <ThemedText variant="body" color="secondary" style={styles.flowText}>
          Move photos out of your device gallery behind a PIN and biometric unlock. Items are stored encrypted — only visible here, inside iPhotos.
        </ThemedText>
        <PressableScale style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={startSetup}>
          <ThemedText variant="body" color="inverse" style={styles.buttonLabel}>
            Choose a PIN
          </ThemedText>
        </PressableScale>
      </Animated.View>
    );
  }

  if (stage === 'setup-pin' || stage === 'setup-confirm') {
    return shell(
      <Animated.View entering={FadeIn.duration(150)} style={styles.flow}>
        <ThemedText variant="titleMedium" style={styles.flowTitle}>
          {stage === 'setup-pin' ? 'Enter a 4-digit PIN' : 'Confirm your PIN'}
        </ThemedText>
        <PinDots length={pin.length} maxLength={PIN_LENGTH} />
        <PinPad
          length={pin.length}
          maxLength={PIN_LENGTH}
          shakeKey={shakeKey}
          onDigit={onSetupDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
        />
        {stage === 'setup-confirm' ? (
          <Pressable hitSlop={12} onPress={startSetup}>
            <ThemedText variant="bodySmall" color="accent">
              Start over
            </ThemedText>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  if (stage === 'setup-biometric') {
    return shell(
      <Animated.View entering={FadeInDown.duration(200)} style={styles.flow}>
        <View style={[styles.lockIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Icon name="finger-print-outline" size={34} color={colors.accent} />
        </View>
        <ThemedText variant="title" style={styles.flowTitle}>
          Enable biometric unlock?
        </ThemedText>
        <ThemedText variant="body" color="secondary" style={styles.flowText}>
          Unlock faster with Face/fingerprint recognition. You can always use your PIN.
        </ThemedText>
        <PressableScale style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => void enableBiometric(true)}>
          <ThemedText variant="body" color="inverse" style={styles.buttonLabel}>
            Enable
          </ThemedText>
        </PressableScale>
        <PressableScale style={styles.secondaryButton} onPress={() => void enableBiometric(false)}>
          <ThemedText variant="body" color="secondary">
            Skip for now
          </ThemedText>
        </PressableScale>
      </Animated.View>
    );
  }

  if (stage === 'gate' && !unlocked) {
    return shell(
      <Animated.View entering={FadeInDown.springify().dampingRatio(0.85)} style={styles.flow}>
        <View style={[styles.lockIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Icon name="lock-closed-outline" size={34} color={colors.accent} />
        </View>
        <ThemedText variant="title" style={styles.flowTitle}>
          Locked Folder is locked
        </ThemedText>
        <PressableScale style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={() => void tryBiometric()}>
          <ThemedText variant="body" color="inverse" style={styles.buttonLabel}>
            Unlock with biometrics
          </ThemedText>
        </PressableScale>
        <Pressable hitSlop={12} onPress={() => setStage('gate-pin')}>
          <ThemedText variant="bodySmall" color="accent">
            Use PIN instead
          </ThemedText>
        </Pressable>
      </Animated.View>
    );
  }

  if (stage === 'gate-pin' && !unlocked) {
    return shell(
      <Animated.View entering={FadeIn.duration(150)} style={styles.flow}>
        <ThemedText variant="titleMedium" style={styles.flowTitle}>
          Enter your PIN
        </ThemedText>
        <PinDots length={pin.length} maxLength={PIN_LENGTH} error={false} />
        <PinPad
          length={pin.length}
          maxLength={PIN_LENGTH}
          shakeKey={shakeKey}
          onDigit={onGateDigit}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
        />
        {biometricAvailable && config?.biometric ? (
          <Pressable hitSlop={12} onPress={() => setStage('gate')}>
            <ThemedText variant="bodySmall" color="accent">
              Use biometrics instead
            </ThemedText>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  }

  // ----- Unlocked: the hidden grid -----
  return shell(
    <View style={styles.content}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : assets.length === 0 && legacyCount === 0 ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Nothing here yet"
          subtitle="Long-press photos on the Photos tab, then use the lock action to move them here."
        />
      ) : (
        <View style={styles.content}>
          {legacyCount > 0 ? (
            <View style={[styles.upgradeCard, { backgroundColor: colors.surface }]}>
              <Icon name="shield-half-outline" size={20} color={colors.accent} />
              <View style={styles.upgradeText}>
                <ThemedText variant="bodySmall" color="secondary">
                  {migrating
                    ? `Encrypting… ${migrateProgress.done}/${migrateProgress.total}`
                    : `${legacyCount} item${legacyCount === 1 ? '' : 's'} still use old hiding — visible in your device gallery.`}
                </ThemedText>
                {!migrating ? (
                  <PressableScale style={[styles.upgradeButton, { backgroundColor: colors.accent }]} onPress={runMigration}>
                    <ThemedText variant="bodySmall" color="inverse" style={styles.upgradeButtonLabel}>
                      Encrypt now
                    </ThemedText>
                  </PressableScale>
                ) : null}
              </View>
            </View>
          ) : null}
          <PhotoGrid assets={assets} context="locked" stickyMonths={false} />
        </View>
      )}

      {selectionActive ? (
        <SelectionBar
          count={selectedCount}
          onExit={() => useSelectionStore.getState().end()}
          actions={[
            { icon: 'share-outline', label: 'Share', onPress: () => void bulk.share() },
            { icon: 'lock-open-outline', label: 'Unlock', onPress: () => void bulk.toggleLocked() },
            {
              icon: 'trash-outline',
              label: 'Delete',
              destructive: true,
              onPress: () =>
                Alert.alert(
                  `Delete ${selectedCount} item${selectedCount === 1 ? '' : 's'}?`,
                  'They will be permanently deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void bulk.remove().then((ok) => !ok && setToast('Could not delete')),
                    },
                  ]
                ),
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, height: 52 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '600' },
  flow: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 18 },
  lockIconWrap: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  upgradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  upgradeText: { flex: 1, gap: 8 },
  upgradeButton: { alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  upgradeButtonLabel: { fontWeight: '600' },
  flowTitle: { textAlign: 'center' },
  flowText: { textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  primaryButton: { borderRadius: 24, paddingHorizontal: 32, paddingVertical: 13 },
  secondaryButton: { padding: 8 },
  buttonLabel: { fontWeight: '600' },
});

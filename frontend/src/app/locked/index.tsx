import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FadeIn, FadeInDown } from 'react-native-reanimated';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MiniToast } from '@/components/MiniToast';
import { PinDots, PinPad } from '@/components/PinPad';
import { SelectionBar } from '@/components/SelectionBar';
import { ThemedText } from '@/components/ThemedText';
import {
  ButtonLabel,
  Center,
  Content,
  Flow,
  FlowText,
  FlowTitle,
  Header,
  HeaderSpacer,
  HeaderTitle,
  LockIconWrap,
  PrimaryButton,
  Screen,
  SecondaryButton,
  UpgradeButton,
  UpgradeButtonLabel,
  UpgradeCard,
  UpgradeText,
} from '@/screens/locked/index.styles';
import { PhotoGrid } from '@/components/grid/PhotoGrid';
import { fetchAssetsByIds } from '@/data/media-repository';
import { getLockedIdList, readLockedConfig, setupLockedFolder, verifyPin, type LockedFolderConfig } from '@/data/locked-repository';
import { isVaultSupported } from '@/data/vault-crypto';
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
  const supported = isVaultSupported();

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
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel="Close">
          <Icon name="close" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">Locked Folder</HeaderTitle>
        <HeaderSpacer />
      </Header>
      {children}
      <MiniToast message={toast} onDismissed={() => setToast(null)} />
    </Screen>
  );

  if (!supported) {
    return shell(
      <Flow entering={FadeInDown.springify().dampingRatio(0.85)}>
        <LockIconWrap $soft={false}>
          <Icon name="lock-closed-outline" size={34} color={colors.textDisabled} />
        </LockIconWrap>
        <FlowTitle variant="title">Not available here</FlowTitle>
        <FlowText variant="body" color="secondary">
          The Locked Folder needs the native crypto module, which the Expo Go preview client does not
          include. Run a development build (expo run:android) to use it.
        </FlowText>
      </Flow>
    );
  }

  if (stage === 'loading') {
    return (
      <Center $insetTop={insets.top}>
        <ActivityIndicator size="large" color={colors.accent} />
      </Center>
    );
  }

  if (stage === 'setup-intro') {
    return shell(
      <Flow entering={FadeInDown.springify().dampingRatio(0.85)}>
        <LockIconWrap $soft>
          <Icon name="lock-closed" size={34} color={colors.accent} />
        </LockIconWrap>
        <FlowTitle variant="title">Set up your Locked Folder</FlowTitle>
        <FlowText variant="body" color="secondary">
          Move photos out of your device gallery behind a PIN and biometric unlock. Items are stored encrypted — only visible here, inside iPhotos.
        </FlowText>
        <PrimaryButton onPress={startSetup}>
          <ButtonLabel variant="body" color="inverse">
            Choose a PIN
          </ButtonLabel>
        </PrimaryButton>
      </Flow>
    );
  }

  if (stage === 'setup-pin' || stage === 'setup-confirm') {
    return shell(
      <Flow entering={FadeIn.duration(150)}>
        <FlowTitle variant="titleMedium">
          {stage === 'setup-pin' ? 'Enter a 4-digit PIN' : 'Confirm your PIN'}
        </FlowTitle>
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
      </Flow>
    );
  }

  if (stage === 'setup-biometric') {
    return shell(
      <Flow entering={FadeInDown.duration(200)}>
        <LockIconWrap $soft>
          <Icon name="finger-print-outline" size={34} color={colors.accent} />
        </LockIconWrap>
        <FlowTitle variant="title">Enable biometric unlock?</FlowTitle>
        <FlowText variant="body" color="secondary">
          Unlock faster with Face/fingerprint recognition. You can always use your PIN.
        </FlowText>
        <PrimaryButton onPress={() => void enableBiometric(true)}>
          <ButtonLabel variant="body" color="inverse">
            Enable
          </ButtonLabel>
        </PrimaryButton>
        <SecondaryButton onPress={() => void enableBiometric(false)}>
          <ThemedText variant="body" color="secondary">
            Skip for now
          </ThemedText>
        </SecondaryButton>
      </Flow>
    );
  }

  if (stage === 'gate' && !unlocked) {
    return shell(
      <Flow entering={FadeInDown.springify().dampingRatio(0.85)}>
        <LockIconWrap $soft>
          <Icon name="lock-closed-outline" size={34} color={colors.accent} />
        </LockIconWrap>
        <FlowTitle variant="title">Locked Folder is locked</FlowTitle>
        <PrimaryButton onPress={() => void tryBiometric()}>
          <ButtonLabel variant="body" color="inverse">
            Unlock with biometrics
          </ButtonLabel>
        </PrimaryButton>
        <Pressable hitSlop={12} onPress={() => setStage('gate-pin')}>
          <ThemedText variant="bodySmall" color="accent">
            Use PIN instead
          </ThemedText>
        </Pressable>
      </Flow>
    );
  }

  if (stage === 'gate-pin' && !unlocked) {
    return shell(
      <Flow entering={FadeIn.duration(150)}>
        <FlowTitle variant="titleMedium">Enter your PIN</FlowTitle>
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
      </Flow>
    );
  }

  // ----- Unlocked: the hidden grid -----
  return shell(
    <Content>
      {loading ? (
        <Center>
          <ActivityIndicator size="large" color={colors.accent} />
        </Center>
      ) : assets.length === 0 && legacyCount === 0 ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Nothing here yet"
          subtitle="Long-press photos on the Photos tab, then use the lock action to move them here."
        />
      ) : (
        <Content>
          {legacyCount > 0 ? (
            <UpgradeCard>
              <Icon name="shield-half-outline" size={20} color={colors.accent} />
              <UpgradeText>
                <ThemedText variant="bodySmall" color="secondary">
                  {migrating
                    ? `Encrypting… ${migrateProgress.done}/${migrateProgress.total}`
                    : `${legacyCount} item${legacyCount === 1 ? '' : 's'} still use old hiding — visible in your device gallery.`}
                </ThemedText>
                {!migrating ? (
                  <UpgradeButton onPress={runMigration}>
                    <UpgradeButtonLabel variant="bodySmall" color="inverse">
                      Encrypt now
                    </UpgradeButtonLabel>
                  </UpgradeButton>
                ) : null}
              </UpgradeText>
            </UpgradeCard>
          ) : null}
          <PhotoGrid assets={assets} context="locked" stickyMonths={false} />
        </Content>
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
    </Content>
  );
}

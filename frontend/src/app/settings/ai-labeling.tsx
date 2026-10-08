import { useState } from 'react';
import { CONTENT_MAX_WIDTH } from '@/theme/scale';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/Icon';
import { LabeledInput } from '@/components/LabeledInput';
import { MiniToast } from '@/components/MiniToast';
import { ThemedText } from '@/components/ThemedText';
import {
  Body,
  Card,
  CardText,
  ErrorText,
  Footnote,
  Form,
  Header,
  HeaderSpacer,
  HeaderTitle,
  PrimaryButton,
  PrimaryButtonText,
  ProgressBlock,
  ProgressLine,
  Screen,
  Scroll,
  TextButton,
  Track,
  TrackFill,
} from '@/screens/settings/ai-labeling.styles';
import type { BulkToast } from '@/hooks/use-bulk-actions';
import { useTranslation } from '@/i18n/hook';
import { useAiLabelingStore } from '@/stores/ai-labeling';
import { useClassificationStore } from '@/stores/classification';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/**
 * Sets up the AI labeling endpoint: any OpenAI-compatible vision server
 * (api.openai.com, OpenRouter, or a local Ollama/LM Studio instance). Photos
 * are sent there as base64 to generate labels — the honest privacy trade is
 * stated right on the screen, and nothing is sent until this is configured.
 */
export default function AiLabelingScreen() {
  const { colors, space } = useTheme();
  const { t, localeTag } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const endpoint = useAiLabelingStore((s) => s.endpoint);
  const model = useAiLabelingStore((s) => s.model);
  const hasApiKey = useAiLabelingStore((s) => s.hasApiKey);
  const setConfig = useAiLabelingStore((s) => s.setConfig);
  const setApiKey = useAiLabelingStore((s) => s.setApiKey);

  const aiRunning = useClassificationStore((s) => s.aiRunning);
  const aiProgress = useClassificationStore((s) => s.aiProgress);
  const aiLastError = useClassificationStore((s) => s.aiLastError);
  const runAiIndexation = useClassificationStore((s) => s.runAiIndexation);

  const [endpointDraft, setEndpointDraft] = useState(endpoint);
  const [modelDraft, setModelDraft] = useState(model);
  const [keyDraft, setKeyDraft] = useState('');
  const [toast, setToast] = useState<BulkToast | null>(null);

  const configured = endpoint.length > 0 && model.length > 0;
  const pct =
    aiProgress && aiProgress.total > 0
      ? Math.min(100, Math.floor((aiProgress.scanned / aiProgress.total) * 100))
      : aiRunning
        ? 0
        : null;

  const save = async () => {
    haptic('light');
    setConfig(endpointDraft, modelDraft);
    if (keyDraft.trim().length > 0) await setApiKey(keyDraft);
    setKeyDraft('');
    setToast({ key: 'common.saved' });
  };

  const start = () => {
    haptic('light');
    void runAiIndexation();
  };

  const confirmRedo = () => {
    haptic('light');
    Alert.alert(t('aiLabeling.redoTitle'), t('aiLabeling.redoBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('aiModel.redo'), style: 'destructive', onPress: () => void runAiIndexation(true) },
    ]);
  };

  return (
    <Screen>
      <Scroll
        contentContainerStyle={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center', paddingTop: insets.top + space[2], paddingBottom: space[10] }}
        keyboardShouldPersistTaps="handled"
      >
        <Header>
          <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
            <Icon name="arrow-back" size={24} />
          </Pressable>
          <HeaderTitle variant="titleMedium">{t('settings.ai.labelingTitle')}</HeaderTitle>
          <HeaderSpacer />
        </Header>

        <Body>
          <Card>
            <Icon name="color-wand-outline" size={22} color={colors.icon} />
            <CardText>
              <ThemedText variant="body">{t('aiLabeling.cardTitle')}</ThemedText>
              <ThemedText variant="bodySmall" color="secondary">
                {t('aiLabeling.cardBody')}
              </ThemedText>
            </CardText>
          </Card>

          <Form>
            <LabeledInput
              label={t('aiLabeling.endpointLabel')}
              value={endpointDraft}
              onChangeText={setEndpointDraft}
              placeholder="https://api.openai.com/v1"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              inputMode="url"
            />
            <LabeledInput
              label={t('aiLabeling.modelLabel')}
              value={modelDraft}
              onChangeText={setModelDraft}
              placeholder="gpt-4o-mini"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <LabeledInput
              label={hasApiKey ? t('aiLabeling.keyStored') : t('aiLabeling.keyOptional')}
              value={keyDraft}
              onChangeText={setKeyDraft}
              placeholder={hasApiKey ? '••••••••' : 'sk-…'}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <SaveButton onPress={() => void save()} label={t('common.save')} />
          </Form>

          <Card>
            <CardText>
              <ThemedText variant="body">
                {configured ? t('aiLabeling.readyTitle') : t('aiLabeling.notConfiguredTitle')}
              </ThemedText>
              {aiRunning ? (
                <ProgressBlock>
                  <ProgressLine>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <ThemedText variant="bodySmall" color="secondary">
                      {pct !== null
                        ? t('settings.ai.labeling', {
                            percent: pct,
                            count: aiProgress?.scanned.toLocaleString(localeTag) ?? '0',
                            total: aiProgress?.total.toLocaleString(localeTag) ?? '0',
                          })
                        : t('aiLabeling.starting')}
                    </ThemedText>
                  </ProgressLine>
                  <Track>
                    <TrackFill $pct={pct ?? 0} />
                  </Track>
                </ProgressBlock>
              ) : (
                <ThemedText variant="bodySmall" color="secondary">
                  {configured
                    ? t('aiLabeling.backgroundHint')
                    : t('aiLabeling.setupHint')}
                </ThemedText>
              )}
              {aiLastError ? (
                <ErrorText variant="bodySmall" color="danger">
                  {aiLastError}
                </ErrorText>
              ) : null}
            </CardText>
          </Card>

          {configured ? (
            <RunButton disabled={aiRunning} onPress={start} label={aiRunning ? t('aiModel.labeling') : t('aiModel.labelNow')} />
          ) : null}
          {configured && !aiRunning ? (
            <TextButton onPress={confirmRedo}>
              <ThemedText variant="bodySmall" color="danger">
                {t('aiLabeling.redoFromScratch')}
              </ThemedText>
            </TextButton>
          ) : null}

          <Footnote variant="bodySmall" color="secondary">
            {t('aiLabeling.footnote')}
          </Footnote>
        </Body>
      </Scroll>
      <MiniToast message={toast ? t(toast.key, toast.params) : null} onDismissed={() => setToast(null)} />
    </Screen>
  );
}

/** Save button with pressed feedback. */
function SaveButton({ onPress, label }: { onPress: () => void; label: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <PrimaryButton
      $pressed={pressed}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
    >
      <PrimaryButtonText variant="body">{label}</PrimaryButtonText>
    </PrimaryButton>
  );
}

/** Run-labeling button with pressed and disabled states. */
function RunButton({ disabled, onPress, label }: { disabled: boolean; onPress: () => void; label: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <PrimaryButton
      $pressed={pressed}
      $disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      disabled={disabled}
    >
      <PrimaryButtonText variant="body">{label}</PrimaryButtonText>
    </PrimaryButton>
  );
}

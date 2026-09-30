import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { useTheme } from '@/theme/context';

interface LabeledInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  label: string;
  value: string;
  error?: string | null;
  onChangeText: (text: string) => void;
}

/** Themed labeled text field used by the auth screens. */
export function LabeledInput({ label, value, error, onChangeText, ...inputProps }: LabeledInputProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <ThemedText variant="label" color="secondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={label}
        style={[
          styles.input,
          { backgroundColor: colors.surface, color: colors.text, borderColor: error ? colors.danger : 'transparent' },
        ]}
        {...inputProps}
      />
      {error ? (
        <ThemedText variant="bodySmall" color="danger">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    borderRadius: 14,
    borderWidth: 1.5,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
  },
});

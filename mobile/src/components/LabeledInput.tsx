import { type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { Field, Wrap } from '@/components/LabeledInput.styles';
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
    <Wrap>
      <ThemedText variant="label" color="secondary">
        {label}
      </ThemedText>
      <Field
        $error={Boolean(error)}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textDisabled}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <ThemedText variant="bodySmall" color="danger">
          {error}
        </ThemedText>
      ) : null}
    </Wrap>
  );
}

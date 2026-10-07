import { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import { Container, IconWrap, Subtitle, Title } from '@/components/EmptyState.styles';
import { useTheme } from '@/theme/context';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <Container entering={FadeInDown.delay(80).springify().dampingRatio(0.8)}>
      <IconWrap>
        <Icon name={icon} size={32} color={colors.textSecondary} />
      </IconWrap>
      <Title variant="titleMedium">{title}</Title>
      {subtitle ? (
        <Subtitle variant="bodySmall" color="secondary">
          {subtitle}
        </Subtitle>
      ) : null}
    </Container>
  );
}

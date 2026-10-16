import { Linking } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Button,
  ButtonLabel,
  Container,
  Content,
  IconWrap,
  Link,
  Subtitle,
  Title,
} from '@/components/PermissionGate.styles';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

interface PermissionGateProps {
  /** 'denied' shows the open-settings path; 'limited' shows "allow more". */
  status: 'denied' | 'limited';
  onRequest: () => void;
}

/** Media-library permission onboarding / recovery screen. */
export function PermissionGate({ status, onRequest }: PermissionGateProps) {
  const { colors } = useTheme();

  const openSettings = () => {
    haptic('light');
    void Linking.openSettings();
  };

  return (
    <Container>
      <Content entering={FadeInDown.springify().dampingRatio(0.85)}>
        <IconWrap>
          <Icon name="images-outline" size={40} color={colors.accent} />
        </IconWrap>
        <Title variant="title">
          {status === 'denied' ? 'Allow access to your photos' : 'Allow access to more photos'}
        </Title>
        <Subtitle variant="body" color="secondary">
          {status === 'denied'
            ? 'iPhotos needs permission to display your photo and video library. Everything stays on your device.'
            : 'You have granted access to a limited selection. Allow full access to see your entire library.'}
        </Subtitle>
        {status === 'denied' ? (
          <>
            <Button
              onPress={() => {
                haptic('medium');
                onRequest();
              }}
            >
              <ButtonLabel variant="body" color="inverse">
                Allow access
              </ButtonLabel>
            </Button>
            <Link onPress={openSettings}>
              <ThemedText variant="bodySmall" color="accent">
                Open system settings
              </ThemedText>
            </Link>
          </>
        ) : (
          <Button
            onPress={() => {
              haptic('medium');
              onRequest();
            }}
          >
            <ButtonLabel variant="body" color="inverse">
              Manage access
            </ButtonLabel>
          </Button>
        )}
      </Content>
    </Container>
  );
}

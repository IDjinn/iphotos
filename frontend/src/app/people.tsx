import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { ThemedText } from '@/components/ThemedText';
import {
  Center,
  Header,
  HeaderSpacer,
  HeaderTitle,
  PeopleGrid,
  PeopleWrap,
  PersonCardWrap,
  PersonCircle,
  PersonCircleImage,
  PersonCount,
  PersonName,
  Screen,
} from '@/screens/people.styles';
import { listPeople, type Person } from '@/data/people-repository';
import { useTranslation } from '@/i18n/hook';
import { useFaceCropSource } from '@/hooks/use-cloud-file';
import { useTheme } from '@/theme/context';
import { haptic } from '@/utils/haptics';

/**
 * All detected people (doc 18 §10) — reached from the Search tab's People row.
 * Groups come from the backend face clustering; covers are face crops.
 */
export default function PeopleScreen() {
  const { colors } = useTheme();
  const { t, tCount } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPeople(await listPeople());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Renames/merges/deletes happen on the person screen — reload on every focus.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <Screen $insetTop={insets.top}>
      <Header>
        <Pressable hitSlop={12} onPress={() => router.back()} accessibilityLabel={t('common.back')}>
          <Icon name="arrow-back" size={24} />
        </Pressable>
        <HeaderTitle variant="titleMedium">{t('people.title')}</HeaderTitle>
        <HeaderSpacer />
      </Header>

      {people === null && !error ? (
        <Center $insetTop={0}>
          <ActivityIndicator size="large" color={colors.accent} />
        </Center>
      ) : error ? (
        <Center $insetTop={0}>
          <ThemedText variant="bodySmall" color="danger">
            {error}
          </ThemedText>
        </Center>
      ) : (people?.length ?? 0) === 0 ? (
        <EmptyState icon="people-outline" title={t('people.emptyTitle')} subtitle={t('people.emptySubtitle')} />
      ) : (
        <PeopleGrid contentContainerStyle={{ paddingBottom: insets.bottom }}>
          <PeopleWrap>
            {(people ?? []).map((person) => (
              <PersonCardItem key={person.id} person={person} />
            ))}
          </PeopleWrap>
        </PeopleGrid>
      )}
    </Screen>
  );
}

/** People-grid card: cover from the persistent face-crop cache, name + count. */
function PersonCardItem({ person }: { person: Person }) {
  const { t, tCount } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const cover = useFaceCropSource(person.coverFaceId);

  return (
    <PersonCardWrap>
      <PersonCircle
        onPress={() => {
          haptic('light');
          router.push(`/person/${person.id}`);
        }}
        accessibilityLabel={person.name ?? t('people.unnamed')}
        accessibilityRole="button"
      >
        {cover ? (
          <PersonCircleImage source={cover} contentFit="cover" recyclingKey={person.id} />
        ) : (
          <Icon name="person" size={28} color={colors.textSecondary} />
        )}
      </PersonCircle>
      <PersonName numberOfLines={1}>{person.name ?? t('people.unnamed')}</PersonName>
      <PersonCount>
        {tCount('people.photosCount', person.faceCount, { count: person.faceCount })}
      </PersonCount>
    </PersonCardWrap>
  );
}

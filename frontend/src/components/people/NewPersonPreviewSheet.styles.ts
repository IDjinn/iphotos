import { Image } from 'expo-image';
import { FlatList, Pressable, TextInput } from 'react-native';
import styled from 'styled-components/native';

import { ThemedText } from '@/components/ThemedText';
import type { CloudPhoto } from '@/data/cloud-photos-repository';
import type { Person } from '@/data/people-repository';
import { absoluteFill } from '@/theme/shared';

/** "New faces" preview sheet (doc 18 §7.4): paged photo grid behind a
 * suggestion, plus the person picker that folds the cluster into an existing
 * person the AI failed to match. */

export const SheetContent = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-horizontal: ${({ theme }) => theme.space[4]}px;
`;

/** The paged grids own the sheet's remaining height — a FlatList without a
 * definite frame grows to its content and can never scroll. */
export const PhotoGrid = styled(FlatList<CloudPhoto>)`
  flex: 1;
`;

export const PickerList = styled(FlatList<Person>)`
  flex: 1;
`;

export const TitleBlock = styled.View`
  gap: ${({ theme }) => theme.space[1]}px;
`;

export const PreviewCell = styled.View`
  flex: 1;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.md}px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PreviewImage = styled(Image)`
  ${absoluteFill}
`;

/** Grid-area notice (failed load) centered in the sheet's remaining space. */
export const NoticeArea = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
  padding-vertical: ${({ theme }) => theme.space[6]}px;
`;

/** In-list notice (empty grid/picker): flex:1 collapses inside a list's
 * content container, so this centers with padding only. */
export const NoticeInline = styled.View`
  align-items: center;
  padding-vertical: ${({ theme }) => theme.space[6]}px;
`;

export const NoticeRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.md}px;
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

/** Skeleton twins of the photo grid (first page and load-more footer). */
export const SkeletonGrid = styled.View`
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const SkeletonFooter = styled(SkeletonGrid)`
  padding-top: ${({ theme }) => theme.space[2]}px;
`;

export const SkeletonRow = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const SkeletonListRow = styled(SkeletonRow)`
  align-items: center;
`;

export const SkeletonCell = styled.View`
  flex: 1;
  aspect-ratio: 1;
  border-radius: ${({ theme }) => theme.radius.md}px;
  overflow: hidden;
`;

/** Person picker header — back to the photos. */
export const PickerHeader = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

export const PickerTitle = styled(ThemedText)`
  flex: 1;
  text-align: center;
`;

export const PickerHeaderSpacer = styled.View`
  width: ${({ theme }) => theme.ms(24)}px;
`;

export const SearchInput = styled(TextInput)`
  border-width: ${({ theme }) => theme.border.width}px;
  border-color: ${({ theme }) => theme.colors.outline};
  border-radius: ${({ theme }) => theme.radius.md}px;
  padding-horizontal: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  font-size: ${({ theme }) => theme.type.size.body}px;
  color: ${({ theme }) => theme.colors.text};
`;

export const PersonRow = styled(Pressable)<{ $pressed: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]}px;
  padding-vertical: ${({ theme }) => theme.space[2]}px;
  opacity: ${({ $pressed }) => ($pressed ? 0.7 : 1)};
`;

/** Cover fills the whole circle — the server-side crop already carries the
 * face padding (Ml:FaceCropPadding). */
export const PersonAvatar = styled(Image)`
  width: ${({ theme }) => theme.ms(44)}px;
  height: ${({ theme }) => theme.ms(44)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PersonAvatarFallback = styled.View`
  width: ${({ theme }) => theme.ms(44)}px;
  height: ${({ theme }) => theme.ms(44)}px;
  border-radius: ${({ theme }) => theme.radius.full}px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.placeholder};
`;

export const PersonMeta = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.space[1]}px;
`;

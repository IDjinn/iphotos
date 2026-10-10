import { API_URL, apiJson, authHeaders } from '@/data/api-client';
import type { CloudPhoto, PagedResult } from '@/data/cloud-photos-repository';

/**
 * People repository — backend face clustering (docs/plans/18-pessoas-e-labels-ia.md §9).
 * The backend groups detected faces into persons; this is the typed contract to
 * list, name, merge and browse them. Person covers render from the face-crop
 * endpoint, which (like photo files) requires the Bearer token.
 */

export interface Person {
  id: string;
  /** null renders as "Unnamed" (Google-Photos style auto groups). */
  name: string | null;
  faceCount: number;
  coverFaceId: string | null;
}

export function faceCropUrl(faceId: string): string {
  return `${API_URL}/api/faces/${faceId}/crop`;
}

/** Authenticated source for the cover circle / face chips. */
export function faceCropSource(faceId: string): { uri: string; headers: Record<string, string> } | null {
  if (!faceId) return null;
  return { uri: faceCropUrl(faceId), headers: authHeaders() };
}

export async function listPeople(): Promise<Person[]> {
  return apiJson<Person[]>('/api/people');
}

export async function listPersonPhotos(
  personId: string,
  page = 1,
  pageSize = 60,
): Promise<PagedResult<CloudPhoto>> {
  return apiJson<PagedResult<CloudPhoto>>(`/api/people/${personId}/photos`, {
    params: { page, pageSize },
  });
}

export async function renamePerson(personId: string, name: string | null): Promise<void> {
  await apiJson<void>(`/api/people/${personId}`, { method: 'PATCH', body: { name } });
}

export async function mergePeople(sourceId: string, targetId: string): Promise<void> {
  await apiJson<void>('/api/people/merge', { method: 'POST', body: { sourceId, targetId } });
}

export async function deletePerson(personId: string): Promise<void> {
  await apiJson<void>(`/api/people/${personId}`, { method: 'DELETE' });
}

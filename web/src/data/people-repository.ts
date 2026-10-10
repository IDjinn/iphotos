import { apiJson } from "@/data/api-client";
import type { CloudPhoto, PagedResult } from "@/data/cloud-photos-repository";

/**
 * People repository — backend face clustering (docs/plans/18-pessoas-e-labels-ia.md
 * §9, mirrored from the mobile contract per D16). The backend groups detected faces
 * into persons; this is the typed contract to list, name, merge and browse them,
 * plus the "same person?" review suggestions (§7.4). Person covers render from the
 * face-crop endpoint, which (like photo files) requires the Bearer token — see
 * `useFaceCropUrl` in blob-cache.
 */

export interface Person {
  id: string;
  /** null renders as "Unnamed" (Google-Photos style auto groups). */
  name: string | null;
  faceCount: number;
  coverFaceId: string | null;
}

export interface PersonSuggestion {
  /** Stable hash of the member face ids — the key for persisted dismissals. */
  id: string;
  faceCount: number;
  coverFaceId: string | null;
  /** Drives the accept call (may be capped below faceCount by the backend). */
  faceIds: string[];
  /** Photos to peek at while reviewing (distinct, capped). */
  samplePhotoIds: string[];
}

export async function listPeople(): Promise<Person[]> {
  return apiJson<Person[]>("/api/people");
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
  await apiJson<void>(`/api/people/${personId}`, { method: "PATCH", body: { name } });
}

export async function mergePeople(sourceId: string, targetId: string): Promise<void> {
  await apiJson<void>("/api/people/merge", { method: "POST", body: { sourceId, targetId } });
}

export async function deletePerson(personId: string): Promise<void> {
  await apiJson<void>(`/api/people/${personId}`, { method: "DELETE" });
}

/** "Same person?" review candidates: unassigned faces above the suggestion threshold. */
export async function listPersonSuggestions(): Promise<PersonSuggestion[]> {
  return apiJson<PersonSuggestion[]>("/api/people/suggestions");
}

/** Creates one person from a reviewed suggestion group; returns the new person. */
export async function acceptPersonSuggestion(faceIds: string[]): Promise<Person> {
  return apiJson<Person>("/api/people/suggestions/accept", {
    method: "POST",
    body: { faceIds },
  });
}

/** Fetches a face crop as a Blob (authenticated, with 401 refresh retry). */
export async function fetchFaceCropBlob(faceId: string): Promise<Blob> {
  return apiJson<Blob>(`/api/faces/${faceId}/crop`, { responseType: "blob" });
}

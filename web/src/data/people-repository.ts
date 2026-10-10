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

/** "Same person?" candidate tied to an existing person: unassigned faces whose
 * best centroid similarity cleared the suggestion threshold (doc 18 §7.4). */
export interface MergeSuggestion {
  /** Stable hash of the person id + member face ids — the dismissal key. */
  id: string;
  personId: string;
  personName: string | null;
  personCoverFaceId: string | null;
  faceCount: number;
  /** Best candidate face of the unassigned set (drives the review strip). */
  coverFaceId: string | null;
  faceIds: string[];
  samplePhotoIds: string[];
  /** Mean centroid similarity of the group (0..1) — the review confidence. */
  similarity: number;
}

/** The review queue split by destination: merge into an existing person vs
 * start a new one. */
export interface PersonSuggestions {
  newPeople: PersonSuggestion[];
  merges: MergeSuggestion[];
}

export interface PersonDetail extends Person {
  /** Mean member-to-centroid similarity (0..1); null when it can't be computed. */
  confidence: number | null;
}

export async function listPeople(): Promise<Person[]> {
  return apiJson<Person[]>("/api/people");
}

export async function getPerson(personId: string): Promise<PersonDetail> {
  return apiJson<PersonDetail>(`/api/people/${personId}`);
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

/** "Same person?" review candidates, split by destination (merges per person +
 * new-person groups). */
export async function listPersonSuggestions(): Promise<PersonSuggestions> {
  return apiJson<PersonSuggestions>("/api/people/suggestions");
}

/** Creates one person from a reviewed suggestion group; returns the new person. */
export async function acceptPersonSuggestion(faceIds: string[]): Promise<Person> {
  return apiJson<Person>("/api/people/suggestions/accept", {
    method: "POST",
    body: { faceIds },
  });
}

/** Assigns reviewed faces into an existing person (the merge half of the review). */
export async function acceptMergeSuggestion(
  personId: string,
  faceIds: string[],
): Promise<void> {
  await apiJson<void>("/api/people/suggestions/merge", {
    method: "POST",
    body: { personId, faceIds },
  });
}

/** Fetches a face crop as a Blob (authenticated, with 401 refresh retry). */
export async function fetchFaceCropBlob(faceId: string): Promise<Blob> {
  return apiJson<Blob>(`/api/faces/${faceId}/crop`, { responseType: "blob" });
}

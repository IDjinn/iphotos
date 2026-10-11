import { API_URL, apiJson, authHeaders } from '@/data/api-client';
import type { CloudPhoto, PagedResult } from '@/data/cloud-photos-repository';

/**
 * People repository — backend face clustering (docs/plans/18-pessoas-e-labels-ia.md §9).
 * The backend groups detected faces into persons; this is the typed contract to
 * list, name, merge and browse them, plus the §7.4 review queue (suggestions).
 * Person covers render from the face-crop endpoint, which (like photo files)
 * requires the Bearer token.
 */

export interface Person {
  id: string;
  /** null renders as "Unnamed" (Google-Photos style auto groups). */
  name: string | null;
  faceCount: number;
  coverFaceId: string | null;
}

/** Person detail: adds the cluster-coherence confidence (0..1, null if unknown). */
export interface PersonDetail extends Person {
  confidence: number | null;
}

/** Faces with no person that look like a brand-new one (doc 18 §7.4). */
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

/** Unassigned faces suggested for an existing person (doc 18 §7.4). */
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

/** One side of a "same person?" group between existing people. */
export interface PersonMergeMember {
  personId: string;
  name: string | null;
  coverFaceId: string | null;
  faceCount: number;
  /** This member's centroid-to-target cosine (null on the target itself). */
  similarity: number | null;
}

/** Duplicate existing people whose centroids chain together (doc 18 §7.4). */
export interface PersonMergeGroup {
  /** Stable hash of the sorted member ids — the key for persisted dismissals. */
  id: string;
  /** The person that absorbs the rest and keeps the name. */
  target: PersonMergeMember;
  /** The other members, largest first — each merges into the target. */
  members: PersonMergeMember[];
  /** Weakest centroid similarity linking the group (0..1) — the conservative
   * "% match" shown in the review. */
  minSimilarity: number;
}

/** The review queue split by destination (doc 18 §7.4). */
export interface PersonSuggestions {
  newPeople: PersonSuggestion[];
  merges: MergeSuggestion[];
  personMergeGroups: PersonMergeGroup[];
}

/** Per-face verdicts from the one-by-one review (doc 18 §7.4). */
export interface FaceReviewSubmission {
  acceptedFaceIds: string[];
  rejectedFaceIds: string[];
  unsureFaceIds: string[];
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

/** Paged window over the ordered people list (named first) — the grids page
 * instead of materializing every person at once. */
export async function listPeoplePage(page: number, pageSize: number): Promise<PagedResult<Person>> {
  return apiJson<PagedResult<Person>>('/api/people', { params: { page, pageSize } });
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
  await apiJson<void>(`/api/people/${personId}`, { method: 'PATCH', body: { name } });
}

export async function mergePeople(sourceId: string, targetId: string): Promise<void> {
  await apiJson<void>('/api/people/merge', { method: 'POST', body: { sourceId, targetId } });
}

/** Folds several people into one target in a single atomic request — "Merge all"
 * never leaves a half-merged group behind. */
export async function mergePeopleBatch(targetId: string, sourceIds: string[]): Promise<void> {
  await apiJson<void>('/api/people/merge-batch', { method: 'POST', body: { targetId, sourceIds } });
}

export async function deletePerson(personId: string): Promise<void> {
  await apiJson<void>(`/api/people/${personId}`, { method: 'DELETE' });
}

/** The "same person?" review queue, split by destination (doc 18 §7.4). */
export async function listPersonSuggestions(): Promise<PersonSuggestions> {
  return apiJson<PersonSuggestions>('/api/people/suggestions');
}

/** Creates one person from a reviewed suggestion group; returns the new person. */
export async function acceptPersonSuggestion(faceIds: string[]): Promise<Person> {
  return apiJson<Person>('/api/people/suggestions/accept', { method: 'POST', body: { faceIds } });
}

/** Assigns the suggested faces to the existing person. */
export async function acceptMergeSuggestion(personId: string, faceIds: string[]): Promise<void> {
  await apiJson<void>('/api/people/suggestions/merge', {
    method: 'POST',
    body: { personId, faceIds },
  });
}

/** Per-face verdicts: accepted faces join the person, rejections stop
 * resurfacing for that person, unsure ones come back once the person grows. */
export async function submitFaceReview(
  personId: string,
  submission: FaceReviewSubmission,
): Promise<void> {
  await apiJson<void>('/api/people/suggestions/review', {
    method: 'POST',
    body: { personId, ...submission },
  });
}

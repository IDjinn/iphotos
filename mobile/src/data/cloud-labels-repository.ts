import { apiJson } from '@/data/api-client';
import type { CloudPhoto, PagedResult } from '@/data/cloud-photos-repository';

/**
 * Cloud scene labels — backend vision labeling (docs/plans/18-pessoas-e-labels-ia.md §8).
 * Labels are canonical English tags produced server-side; the app lists and browses
 * them (local display names may localize later). This is the read side of the
 * `asset_labels` sync contract that stayed in place when mobile labeling left (doc 05).
 */

export interface LabelCount {
  label: string;
  count: number;
}

export interface PhotoLabel {
  photoId: string;
  label: string;
  score: number;
}

export async function listTopLabels(limit = 30): Promise<LabelCount[]> {
  return apiJson<LabelCount[]>('/api/labels', { params: { limit } });
}

export async function listLabelPhotos(
  label: string,
  page = 1,
  pageSize = 60,
): Promise<PagedResult<CloudPhoto>> {
  return apiJson<PagedResult<CloudPhoto>>(`/api/labels/${encodeURIComponent(label)}/photos`, {
    params: { page, pageSize },
  });
}

export async function listPhotoLabels(photoId: string): Promise<PhotoLabel[]> {
  return apiJson<PhotoLabel[]>(`/api/photos/${photoId}/labels`);
}

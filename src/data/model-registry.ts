import * as Device from 'expo-device';

/**
 * Catalog of the classification models the app will use (docs/plans/05 §4/§5)
 * plus the hardware-capability check that drives the recommendation. This is
 * the selection base only — the inference runtime itself arrives with task 5.2.
 */

export type ModelKind = 'local' | 'cloud';

export interface ModelCapabilities {
  /** Search by meaning ("praia", "dog") using text+image embeddings. */
  semanticSearch: boolean;
  /** Zero-shot labels from a curated PT/EN prompt list. */
  zeroShotLabels: boolean;
  languages: 'pt+en' | 'en';
}

export interface ModelDescriptor {
  id: string;
  name: string;
  kind: ModelKind;
  description: string;
  /** Approximate download size shown in the picker (local models only). */
  sizeLabel?: string;
  /** Minimum device RAM for on-device inference (local models only). */
  minRamBytes?: number;
  capabilities: ModelCapabilities;
}

export const MODEL_CATALOG: ModelDescriptor[] = [
  {
    id: 'clip-vit-b32-int8',
    name: 'CLIP ViT-B/32',
    kind: 'local',
    description: 'Semantic search and labels in Portuguese and English, fully on this device.',
    sizeLabel: '~35 MB',
    minRamBytes: 6 * 1024 * 1024 * 1024,
    capabilities: { semanticSearch: true, zeroShotLabels: true, languages: 'pt+en' },
  },
  {
    id: 'mobilenet-v3-small',
    name: 'MobileNetV3 small',
    kind: 'local',
    description: 'Basic English-only labels. The lightweight option for weaker devices.',
    sizeLabel: '~4 MB',
    minRamBytes: 3 * 1024 * 1024 * 1024,
    capabilities: { semanticSearch: false, zeroShotLabels: true, languages: 'en' },
  },
  {
    id: 'siglip-base',
    name: 'SigLIP base',
    kind: 'cloud',
    description: 'Higher-quality labels and search processed on our servers during backup.',
    capabilities: { semanticSearch: true, zeroShotLabels: true, languages: 'pt+en' },
  },
  {
    id: 'clip-vit-l14',
    name: 'CLIP ViT-L/14',
    kind: 'cloud',
    description: 'Best classification quality. Heavier model, runs on our servers.',
    capabilities: { semanticSearch: true, zeroShotLabels: true, languages: 'pt+en' },
  },
];

export function getModel(id: string): ModelDescriptor | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export interface HardwareCapability {
  /** Total device RAM in bytes, when reported (Android). */
  totalRamBytes: number | null;
  /** First supported CPU architecture, e.g. 'arm64-v8a'. */
  cpuArch: string | null;
  /** Whether we are running on a physical device (vs emulator). */
  isPhysicalDevice: boolean;
}

export function getHardwareCapability(): HardwareCapability {
  return {
    totalRamBytes: Device.totalMemory ?? null,
    cpuArch: Device.supportedCpuArchitectures?.[0] ?? null,
    isPhysicalDevice: Device.isDevice,
  };
}

export function formatRam(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024 * 1024))} GB RAM`;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/**
 * Whether a model can be selected on this device. Cloud models stay
 * unselectable until the cloud service (phase 5) exists — same honest
 * "coming soon" treatment as the Backup rows in Settings.
 */
export function modelEligibility(model: ModelDescriptor, cap: HardwareCapability): Eligibility {
  if (model.kind === 'cloud') {
    return { ok: false, reason: 'Requires Cloud mode — coming soon' };
  }
  const min = model.minRamBytes;
  if (min && (!cap.totalRamBytes || cap.totalRamBytes < min)) {
    return { ok: false, reason: `Not enough RAM (needs ${formatRam(min)})` };
  }
  return { ok: true };
}

/**
 * The most capable local model this device can run, or null when the
 * hardware can't handle any local model (cloud-only device).
 */
export function recommendModel(cap: HardwareCapability): ModelDescriptor | null {
  const eligible = MODEL_CATALOG.filter(
    (m) => m.kind === 'local' && modelEligibility(m, cap).ok
  ).sort((a, b) => (b.minRamBytes ?? 0) - (a.minRamBytes ?? 0));
  return eligible[0] ?? null;
}

import type { Family } from '../types';

export interface FamilyMetadata {
  icon: string;
  label: string;
}

export const FAMILY_META: Record<Family, FamilyMetadata> = {
  image: {
    icon: '🖼️',
    label: 'image',
  },
  audio: {
    icon: '🎵',
    label: 'audio',
  },
  video: {
    icon: '🎬',
    label: 'video',
  },
  code: {
    icon: '</>',
    label: 'code',
  },
};

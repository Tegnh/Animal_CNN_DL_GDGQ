export type ModelKey = 'efficientnet_b0' | 'custom_cnn';

// Model B is the primary answer, so it always comes first.
export const MODEL_KEYS: ModelKey[] = ['efficientnet_b0', 'custom_cnn'];

export const MODEL_INFO: Record<ModelKey, { letter: string; title: string; latin: string }> = {
  efficientnet_b0: { letter: 'B', title: 'تعلّم بالنقل', latin: 'EfficientNetB0' },
  custom_cnn: { letter: 'A', title: 'مبنيّ من الصفر', latin: 'Custom CNN' },
};

export interface ClientModel {
  key: ModelKey;
  url: string;
  inputName: string;
  outputName: string;
  sizeMb: number;
  threshold: number;
}

export interface SampleVerdict {
  pred: string;
  conf: number;
  correct: boolean;
  belowThreshold: boolean;
}

export interface Sample {
  cls: string;
  url: string;
  ref: Record<ModelKey, SampleVerdict>;
}

export interface ReferenceEntry {
  cls: string;
  url: string;
  probs: Record<ModelKey, number[]>;
}

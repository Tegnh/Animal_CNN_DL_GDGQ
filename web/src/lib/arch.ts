// Block-by-block description of the two networks. Counts that depend on training
// choices are computed from model_card.json; only the fixed EfficientNetB0 layout
// (a published architecture, not a training result) is written out here.
import type { ModelCard } from './data';

export interface ArchBlock {
  name: string;
  detail: string;
  shape: string;
  params: number | null;
}

export interface Architecture {
  blocks: ArchBlock[];
  /** False when the computed counts do not add up to the trained model's total. */
  paramsVerified: boolean;
}

const times = (...dims: number[]) => dims.join('×');

export function customCnnArchitecture(card: ModelCard): Architecture {
  const { filters, inner_size, dropout } = card.models.custom_cnn.settings;
  const [height, width, channels] = card.input.shape;
  const classes = card.classes.length;

  const blocks: ArchBlock[] = [
    { name: 'الدخل', detail: 'صورة ملوّنة RGB', shape: times(height, width, channels), params: 0 },
    {
      name: 'تصغير وتحجيم',
      detail: 'Resize ثم قسمة القيم على 255',
      shape: times(inner_size, inner_size, channels),
      params: 0,
    },
  ];

  let size = inner_size;
  let previous = channels;
  filters.forEach((f, i) => {
    // Two 3×3 convolutions without bias, each followed by batch normalisation
    // (4 values per channel), then 2×2 max pooling.
    const params = 9 * previous * f + 9 * f * f + 2 * 4 * f;
    size = Math.floor(size / 2);
    blocks.push({
      name: `الكتلة ${i + 1}`,
      detail: `2 × (Conv 3×3 · ${f} + BatchNorm + ReLU) ثم MaxPool`,
      shape: times(size, size, f),
      params,
    });
    previous = f;
  });

  blocks.push(
    { name: 'تجميع', detail: 'Global Average Pooling', shape: String(previous), params: 0 },
    { name: 'إسقاط', detail: `Dropout ${dropout}`, shape: String(previous), params: 0 },
    {
      name: 'المخرج',
      detail: `Dense ${classes} + softmax`,
      shape: String(classes),
      params: previous * classes + classes,
    },
  );

  const total = blocks.reduce((sum, b) => sum + (b.params ?? 0), 0);
  return { blocks, paramsVerified: total === card.models.custom_cnn.parameters };
}

// EfficientNetB0 stages for a 224×224 input (Tan & Le, 2019).
const EFFICIENTNET_STAGES: { name: string; detail: string; shape: [number, number, number] }[] = [
  { name: 'الجذع', detail: 'Conv 3×3 بخطوة 2', shape: [112, 112, 32] },
  { name: 'الكتلة 1', detail: 'MBConv1 3×3 × 1', shape: [112, 112, 16] },
  { name: 'الكتلة 2', detail: 'MBConv6 3×3 × 2', shape: [56, 56, 24] },
  { name: 'الكتلة 3', detail: 'MBConv6 5×5 × 2', shape: [28, 28, 40] },
  { name: 'الكتلة 4', detail: 'MBConv6 3×3 × 3', shape: [14, 14, 80] },
  { name: 'الكتلة 5', detail: 'MBConv6 5×5 × 3', shape: [14, 14, 112] },
  { name: 'الكتلة 6', detail: 'MBConv6 5×5 × 4', shape: [7, 7, 192] },
  { name: 'الكتلة 7', detail: 'MBConv6 3×3 × 1', shape: [7, 7, 320] },
  { name: 'القمة', detail: 'Conv 1×1', shape: [7, 7, 1280] },
];

export interface TransferArchitecture {
  blocks: ArchBlock[];
  backboneParams: number;
  headParams: number;
}

export function efficientNetArchitecture(card: ModelCard): TransferArchitecture {
  const [height, width, channels] = card.input.shape;
  const classes = card.classes.length;
  const features = EFFICIENTNET_STAGES[EFFICIENTNET_STAGES.length - 1].shape[2];
  const headParams = features * classes + classes;
  const backboneParams = card.models.efficientnet_b0.parameters - headParams;

  const blocks: ArchBlock[] = [
    { name: 'الدخل', detail: 'صورة ملوّنة RGB', shape: times(height, width, channels), params: 0 },
    ...EFFICIENTNET_STAGES.map((s) => ({
      name: s.name,
      detail: s.detail,
      shape: times(...s.shape),
      params: null,
    })),
    { name: 'تجميع', detail: 'Global Average Pooling', shape: String(features), params: 0 },
    {
      name: 'إسقاط',
      detail: `Dropout ${card.models.efficientnet_b0.settings.dropout}`,
      shape: String(features),
      params: 0,
    },
    { name: 'المخرج', detail: `Dense ${classes} + softmax`, shape: String(classes), params: headParams },
  ];
  return { blocks, backboneParams, headParams };
}

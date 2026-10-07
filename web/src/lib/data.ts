// Build-time readers for the training outputs in public/. Server components only:
// every number on the site comes through here, never from a literal in a page.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ClientModel, ModelKey, ReferenceEntry, Sample } from './types';
import { MODEL_KEYS } from './types';

const PUBLIC = join(process.cwd(), 'public');

function readText(rel: string): string {
  return readFileSync(join(PUBLIC, rel), 'utf8');
}

function readJson<T>(rel: string): T {
  return JSON.parse(readText(rel)) as T;
}

function parseCsv(rel: string): Record<string, string>[] {
  const lines = readText(rel).split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
  });
}

function fileHash(rel: string): string {
  return createHash('sha1').update(readFileSync(join(PUBLIC, rel))).digest('hex').slice(0, 10);
}

export interface TestResults {
  accuracy: number;
  top3_accuracy: number;
  macro_f1: number;
  accuracy_d1: number;
  accuracy_d3: number;
  unknown_threshold: number;
  unknown_rejected: number;
  test_accepted: number;
  accuracy_when_accepted: number;
}

export interface Augmentation {
  rotation_deg: number;
  zoom_in: number;
  zoom_out: number;
  translate: number;
  contrast: number;
  brightness: number;
}

interface ModelEntryBase {
  file: string;
  parameters: number;
  epochs_run: number;
  train_minutes: number;
  unknown_threshold: number;
  test_results: TestResults;
}

export interface ModelCard {
  task: string;
  classes: string[];
  input: { shape: [number, number, number]; values: string; preprocessing: string };
  data: {
    images_per_split: { train: number; val: number; test: number };
    images_per_class: Record<string, { train: number; val: number; test: number }>;
    sources: Record<string, string>;
  };
  training: {
    seed: number;
    batch_size: number;
    label_smoothing: number;
    class_weights: string;
    optimizer: string;
  };
  models: {
    custom_cnn: ModelEntryBase & {
      settings: {
        inner_size: number;
        filters: number[];
        dropout: number;
        l2: number;
        lr: number;
        epochs: number;
        patience: number;
        aug: Augmentation;
      };
    };
    efficientnet_b0: ModelEntryBase & {
      settings: {
        dropout: number;
        head_lr: number;
        head_epochs: number;
        head_patience: number;
        ft_lr: number;
        ft_epochs: number;
        ft_patience: number;
        unfreeze_last: number;
        aug: Augmentation;
      };
    };
  };
  versions: Record<string, string>;
  created: string;
  web: { runtime: string; opset: number; input_layout: string };
}

interface OnnxMetaEntry {
  input_name: string;
  input_shape: (number | null)[];
  output_name: string;
  file: string;
  size_mb: number;
  cpu_ms_per_image: number;
  opset: number;
}

export const getModelCard = () => readJson<ModelCard>('model/model_card.json');
export const getLabels = () => readJson<string[]>('model/labels.json');
const getOnnxMeta = () => readJson<Record<ModelKey, OnnxMetaEntry>>('model/onnx_meta.json');

/** What the browser needs to load and run each model. */
export function getClientModels(): ClientModel[] {
  const meta = getOnnxMeta();
  const card = getModelCard();
  return MODEL_KEYS.map((key) => ({
    key,
    // The hash lets /model/* be cached forever and still change when a file is replaced.
    url: `/model/${meta[key].file}?v=${fileHash(`model/${meta[key].file}`)}`,
    inputName: meta[key].input_name,
    outputName: meta[key].output_name,
    sizeMb: meta[key].size_mb,
    threshold: card.models[key].unknown_threshold,
  }));
}

interface RawReference {
  class: string;
  file: string;
  custom_cnn: number[];
  efficientnet_b0: number[];
}

export function getReference(): ReferenceEntry[] {
  const version = fileHash('model/reference_predictions.json');
  return readJson<RawReference[]>('model/reference_predictions.json').map((r) => ({
    cls: r.class,
    url: `/model/${r.file}?v=${version}`,
    probs: { custom_cnn: r.custom_cnn, efficientnet_b0: r.efficientnet_b0 },
  }));
}

/** Gallery samples with the Python verdict of each model, failures included. */
export function getSamples(): Sample[] {
  const labels = getLabels();
  const card = getModelCard();
  return getReference().map((r) => {
    const verdict = (key: ModelKey) => {
      const probs = r.probs[key];
      const top = probs.indexOf(Math.max(...probs));
      return {
        pred: labels[top],
        conf: probs[top],
        correct: labels[top] === r.cls,
        belowThreshold: probs[top] < card.models[key].unknown_threshold,
      };
    };
    return {
      cls: r.cls,
      url: r.url,
      ref: { custom_cnn: verdict('custom_cnn'), efficientnet_b0: verdict('efficientnet_b0') },
    };
  });
}

export interface F1Row {
  cls: string;
  custom_cnn: number;
  efficientnet_b0: number;
  testImages: number;
}

export function getPerClassF1(): F1Row[] {
  return parseCsv('reports/per_class_f1.csv').map((r) => ({
    cls: r[''],
    custom_cnn: Number(r['Custom CNN']),
    efficientnet_b0: Number(r['EfficientNetB0']),
    testImages: Number(r['test_images']),
  }));
}

export interface HistoryRow {
  epoch: number;
  accuracy: number;
  loss: number;
  val_accuracy: number;
  val_loss: number;
  learning_rate: number;
}

export function getHistory(key: ModelKey): HistoryRow[] {
  return parseCsv(`reports/history_${key}.csv`).map((r) => ({
    epoch: Number(r.epoch),
    accuracy: Number(r.accuracy),
    loss: Number(r.loss),
    val_accuracy: Number(r.val_accuracy),
    val_loss: Number(r.val_loss),
    learning_rate: Number(r.learning_rate),
  }));
}

export interface Confusion {
  truth: string;
  pred: string;
  count: number;
  outOf: number;
}

const PREDICTION_COLUMN: Record<ModelKey, string> = {
  custom_cnn: 'pred_custom_cnn',
  efficientnet_b0: 'pred_efficientnetb0',
};

/** Most frequent (true class -> wrong class) pairs on the test set. */
export function getConfusions(key: ModelKey, limit: number): Confusion[] {
  const rows = parseCsv('reports/test_predictions.csv');
  const perClass = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const r of rows) {
    perClass.set(r.true, (perClass.get(r.true) ?? 0) + 1);
    const pred = r[PREDICTION_COLUMN[key]];
    if (pred !== r.true) {
      const id = `${r.true}>${pred}`;
      pairs.set(id, (pairs.get(id) ?? 0) + 1);
    }
  }
  return [...pairs.entries()]
    .map(([id, count]) => {
      const [truth, pred] = id.split('>');
      return { truth, pred, count, outOf: perClass.get(truth) ?? 0 };
    })
    .sort((a, b) => b.count - a.count || b.count / b.outOf - a.count / a.outOf)
    .slice(0, limit);
}

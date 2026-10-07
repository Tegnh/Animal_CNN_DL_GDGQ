// Arabic display names for the model's class labels. A label missing from this
// map (after retraining with new classes) falls back to its English name.
const ARABIC: Record<string, string> = {
  antelope: 'ظبي',
  bear: 'دب',
  bison: 'بيسون',
  butterfly: 'فراشة',
  cat: 'قط',
  chimpanzee: 'شمبانزي',
  cow: 'بقرة',
  crow: 'غراب',
  deer: 'أيل',
  dog: 'كلب',
  dolphin: 'دلفين',
  donkey: 'حمار',
  duck: 'بطة',
  eagle: 'نسر',
  elephant: 'فيل',
  flamingo: 'فلامنغو',
  fox: 'ثعلب',
  goat: 'ماعز',
  hare: 'أرنب بري',
  horse: 'حصان',
  lion: 'أسد',
  penguin: 'بطريق',
  sheep: 'خروف',
  zebra: 'حمار وحشي',
};

export function arabicName(label: string): string {
  return ARABIC[label] ?? label;
}

export function arabicNames(labels: string[]): Record<string, string> {
  return Object.fromEntries(labels.map((l) => [l, arabicName(l)]));
}

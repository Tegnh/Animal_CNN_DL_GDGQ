// Everything a new owner of this site is likely to change lives here.
export const site = {
  name: 'عُمق',
  nameLatin: 'OMQ',
  subtitle: 'مصنّف الحيوانات بالتعلّم العميق',
  description:
    'نموذجان للتعلّم العميق يتعرّفان على 24 حيوانًا من صورة، ويعملان داخل متصفحك دون رفع الصورة.',
  // Used for absolute social-image URLs. Replace after the first deployment.
  url: 'https://omq.vercel.app',
  author: {
    name: 'طارق الفضل',
    linkedin: 'https://www.linkedin.com/in/tarig-fdl-7a6599348',
    x: 'https://x.com/6ar_t',
    github: 'https://github.com/Tegnh',
  },
  // Largest photo the demo accepts.
  maxUploadMb: 10,
} as const;

export const nav = [
  { href: '/', label: 'المشروع' },
  { href: '/model/', label: 'كيف يعمل' },
  { href: '/test/', label: 'جرّب' },
] as const;

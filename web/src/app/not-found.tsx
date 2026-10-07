import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap" style={{ paddingBlock: '20vh' }}>
      <p className="label">404</p>
      <h1 className="display h1">الصفحة غير موجودة</h1>
      <p style={{ marginBlockStart: '2rem' }}>
        <Link href="/" className="btn">
          العودة إلى البداية
        </Link>
      </p>
    </main>
  );
}

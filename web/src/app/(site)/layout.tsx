import { Footer } from '@/components/Footer';
import { Nav } from '@/components/Nav';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

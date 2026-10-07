'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { nav, site } from '@/site.config';
import { Mark } from './Mark';

const normalise = (path: string) => (path.endsWith('/') ? path : `${path}/`);

export function Nav() {
  const pathname = normalise(usePathname() ?? '/');
  return (
    <header className="site-head">
      <div className="wrap site-head__row">
        <Link href="/" className="brand" aria-label={`${site.name}: الصفحة الرئيسية`}>
          <Mark />
          <span>{site.name}</span>
        </Link>
        <nav className="site-nav" aria-label="التنقّل الرئيسي">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === normalise(item.href) ? 'page' : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/** Main navigation with the current page marked. Rendered inside Suspense by the layout. */
export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return <PlainNavLinks items={items} current={pathname} />;
}

/** The same links with no current page: the fallback while the pathname is unknown. */
export function PlainNavLinks({ items, current }: { items: NavItem[]; current?: string }) {
  return (
    <>
      {items.map((n) => (
        <Link key={n.href} href={n.href} className="nav-link" aria-current={current === n.href || current?.startsWith(`${n.href}/`) ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </>
  );
}

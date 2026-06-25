"use client";

import Link from "next/link";

const LINKS = [
  { label: "Terms", href: "/docs" },
  { label: "Privacy", href: "/docs" },
  { label: "About", href: "/docs" },
] as const;

export default function BuildPageFooter() {
  return (
    <footer className="build-page-footer" aria-label="Site links">
      <nav className="build-page-footer-nav">
        {LINKS.map((link) => (
          <Link key={link.label} href={link.href} className="build-page-footer-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}

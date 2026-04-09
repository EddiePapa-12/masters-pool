"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    label: "Pool Leaderboard",
    href: "/",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M3 9h18'/%3E%3Cpath d='M9 21V9'/%3E%3C/svg%3E",
  },
  {
    label: "Team Rosters",
    href: "/teams",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E",
  },
  {
    label: "Rules & Payout Information",
    href: "/rules",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'/%3E%3C/svg%3E",
  },
  {
    label: "Golf Leaderboard",
    href: "/golf",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z'/%3E%3Cline x1='4' y1='22' x2='4' y2='15'/%3E%3C/svg%3E",
  },
];

export default function NavTabs() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <nav className="main-nav">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`nav-tab-button${isActive(tab.href) ? " active" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tab.icon} alt="" className="nav-tab-icon" />
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

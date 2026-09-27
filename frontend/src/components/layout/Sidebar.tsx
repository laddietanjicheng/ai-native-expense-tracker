"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wallet, ReceiptText, ChartLine, Tag } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Expenses", icon: ReceiptText },
  { href: "/insights", label: "Insights", icon: ChartLine },
  { href: "/categories", label: "Categories", icon: Tag },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col gap-8 border-r border-slate-200 bg-white px-4 py-6">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-white">
          <Wallet size={20} aria-hidden="true" />
        </span>
        <span className="text-base font-extrabold tracking-tight">Expense Tracker</span>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] ${
                isActive
                  ? "bg-primary-50 font-bold text-primary-700"
                  : "font-semibold text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto rounded-lg bg-slate-50 p-3 text-[13px] text-slate-500">
        All amounts in SGD
      </div>
    </aside>
  );
}

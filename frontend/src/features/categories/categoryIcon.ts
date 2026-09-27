import { Utensils, BusFront, Receipt, ShoppingBag, Heart, Ticket, Ellipsis, type LucideIcon } from "lucide-react";

const ICONS_BY_CATEGORY_NAME: Record<string, LucideIcon> = {
  Food: Utensils,
  Transport: BusFront,
  "Bills & Utilities": Receipt,
  Shopping: ShoppingBag,
  Health: Heart,
  Entertainment: Ticket,
};

/** Maps a top-level category name to its Lucide icon; unknown names fall back to Ellipsis. */
export function getCategoryIcon(name: string): LucideIcon {
  return ICONS_BY_CATEGORY_NAME[name] ?? Ellipsis;
}

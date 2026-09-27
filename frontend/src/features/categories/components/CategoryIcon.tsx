import { getCategoryIcon } from "../categoryIcon";

interface CategoryIconProps {
  name: string;
  size?: number;
  className?: string;
}

/** Renders the Lucide icon for a top-level category name, looked up from a fixed map. */
export function CategoryIcon({ name, size = 18, className }: CategoryIconProps) {
  const Icon = getCategoryIcon(name);
  // eslint-disable-next-line react-hooks/static-components -- Icon is a stable lookup from a fixed map, not created per render
  return <Icon size={size} aria-hidden="true" className={className} />;
}

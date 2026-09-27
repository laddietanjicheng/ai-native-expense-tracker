import { X } from "lucide-react";

interface ChipProps {
  label: string;
  onRemove: () => void;
  removeLabel: string;
}

export function Chip({ label, onRemove, removeLabel }: ChipProps) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-50 pl-3 pr-1 text-[13px] font-bold text-primary-700">
      {label}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full text-current hover:bg-primary-100"
      >
        <X size={14} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </span>
  );
}

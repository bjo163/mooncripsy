import { ChevronDown } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<ComponentPropsWithoutRef<"select">, "onChange" | "value"> {
  options?: SelectOption[];
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
}

export function Select({
  className,
  options = [],
  placeholder,
  value,
  onChange,
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-9 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

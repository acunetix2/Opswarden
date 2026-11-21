import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";

interface AvatarProps {
  name: string | null | undefined;
  size?: "sm" | "md";
  tone?: "ink" | "cream";
  className?: string;
}

/** Square monogram, like initials stamped in a margin. */
export function Avatar({ name, size = "md", tone = "ink", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-medium",
        size === "sm" ? "size-7 text-[10.5px]" : "size-9 text-[11.5px]",
        tone === "ink" ? "bg-ink text-canvas" : "bg-canvas text-ink",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

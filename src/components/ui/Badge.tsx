import { ReactNode } from "react";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "navy" | "orange" | "green" | "rose";
}) {
  const toneClass =
    tone === "navy"
      ? "border-[rgba(19,48,107,0.15)] bg-[rgba(19,48,107,0.06)] text-[var(--navy-700)]"
      : tone === "orange"
        ? "border-[rgba(255,122,26,0.25)] bg-[rgba(255,122,26,0.08)] text-[#b2530f]"
        : tone === "green"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : tone === "rose"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : "border-[var(--card-border)] bg-white text-[var(--muted)]";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium shadow-[var(--shadow-sm)]",
        toneClass,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "orange";

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
}) {
  const cls =
    variant === "primary"
      ? "bg-[var(--navy-700)] text-white hover:bg-[var(--navy-900)]"
      : variant === "orange"
        ? "bg-[var(--orange-500)] text-white hover:brightness-95"
        : variant === "ghost"
          ? "bg-transparent text-[var(--navy-700)] hover:bg-[rgba(19,48,107,0.06)]"
          : "border border-[var(--card-border)] bg-white text-[var(--app-fg)] hover:bg-[rgba(11,29,58,0.03)]";

  return (
    <button
      {...props}
      className={[
        "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium shadow-[var(--shadow-sm)]",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        cls,
        props.className ?? "",
      ].join(" ")}
    />
  );
}

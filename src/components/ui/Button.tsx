import { ButtonHTMLAttributes } from "react";

export function Button({
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  const cls =
    variant === "primary"
      ? "bg-indigo-600 text-white hover:bg-indigo-500"
      : "border border-[var(--card-border)] bg-[var(--card)] text-[var(--app-fg)] hover:bg-black/[.03] dark:hover:bg-white/[.06]";

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


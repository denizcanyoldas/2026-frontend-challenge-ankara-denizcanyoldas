import { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-10 w-full rounded-xl border border-[var(--card-border)] bg-white px-3 text-sm text-[var(--app-fg)] shadow-[var(--shadow-sm)]",
        "placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

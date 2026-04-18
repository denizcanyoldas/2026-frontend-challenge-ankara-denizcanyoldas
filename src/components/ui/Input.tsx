import { InputHTMLAttributes } from "react";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "h-10 w-full rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-3 text-sm text-[var(--app-fg)] shadow-[var(--shadow-sm)]",
        "placeholder:text-[var(--muted)] focus-visible:outline-none",
        props.className ?? "",
      ].join(" ")}
    />
  );
}


import { ReactNode } from "react";

export function Card({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--card-border)] bg-white shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--card-border)] px-3 py-3 sm:px-4">
        <div className="min-w-0 text-sm font-semibold tracking-tight text-[var(--navy-900)]">
          {title}
        </div>
        {right ? <div className="shrink-0 max-w-full">{right}</div> : null}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

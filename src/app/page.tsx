export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-[var(--card-border)] bg-[var(--app-bg)]/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-indigo-600 text-white shadow-[var(--shadow-sm)]">
              JP
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                Missing Podo: The Ankara Case
              </div>
              <div className="text-xs text-[var(--muted)]">
                Investigation dashboard (core)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[var(--card-border)] bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted)] shadow-[var(--shadow-sm)]">
              Next.js + Tailwind
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6">
        <section className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div className="flex flex-col gap-2 px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Investigation UI
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
                We’ll connect to your Jotform data sources next. This shell is
                intentionally styled to be close to Jotform’s cards, borders,
                and spacing.
              </p>
            </div>
            <div className="flex gap-2">
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-[var(--shadow-sm)] hover:bg-indigo-500">
                Investigation
              </button>
              <button className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--app-fg)] shadow-[var(--shadow-sm)] hover:bg-black/[.03] dark:hover:bg-white/[.06]">
                Data
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <div className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--card-border)] px-4 py-3 text-sm font-semibold">
                People
              </div>
              <div className="px-4 py-4 text-sm text-[var(--muted)]">
                Coming next: list of linked people across sources.
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--card-border)] px-4 py-3 text-sm font-semibold">
                Events
              </div>
              <div className="px-4 py-4 text-sm text-[var(--muted)]">
                Coming next: event feed with filters and timeline toggle.
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="rounded-[var(--radius)] border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-sm)]">
              <div className="border-b border-[var(--card-border)] px-4 py-3 text-sm font-semibold">
                Detail
              </div>
              <div className="px-4 py-4 text-sm text-[var(--muted)]">
                Coming next: selected record details + raw JSON.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

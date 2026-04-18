import { EventItem } from "@/lib/types";
import { stringifyAnswer } from "@/lib/normalize/event";

type JotformAnswer = {
  name?: string;
  order?: string | number;
  text?: string;
  type?: string;
  answer?: unknown;
};

type Row = {
  label: string;
  value: string;
  order: number;
  type?: string;
};

// Answer types that never carry meaningful content for humans — section
// headings, submit buttons, page breaks, etc.
const SKIP_TYPES = new Set([
  "control_head",
  "control_button",
  "control_pagebreak",
  "control_divider",
  "control_image",
  "control_collapse",
]);

function prettifyLabel(label: string): string {
  const cleaned = label.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Keep the casing the creator used (e.g. "Seen With"), just tidy it.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function collectAnswerRows(raw: unknown): Row[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const answers = obj.answers;
  if (!answers || typeof answers !== "object") return [];

  const rows: Row[] = [];
  for (const entry of Object.values(answers as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const a = entry as JotformAnswer;
    if (a.type && SKIP_TYPES.has(a.type)) continue;

    const value = stringifyAnswer(a.answer);
    if (!value) continue;

    const label =
      (typeof a.text === "string" && a.text.trim()) ||
      (typeof a.name === "string" && a.name.trim()) ||
      "Field";

    const order = Number(a.order);
    rows.push({
      label: prettifyLabel(label),
      value,
      order: Number.isFinite(order) ? order : 9999,
      type: a.type,
    });
  }

  rows.sort((a, b) => a.order - b.order);
  return rows;
}

function MetaGrid({ event }: { event: EventItem }) {
  const raw = (event.raw ?? {}) as Record<string, unknown>;
  const rawId = typeof raw.id === "string" ? raw.id : event.id;
  const formId = typeof raw.form_id === "string" ? raw.form_id : undefined;
  const status = typeof raw.status === "string" ? raw.status : undefined;
  const ip = typeof raw.ip === "string" ? raw.ip : undefined;

  const items: Array<{ label: string; value: string; mono?: boolean }> = [
    {
      label: "Submitted",
      value: new Date(event.createdAt).toLocaleString(),
    },
    { label: "Submission ID", value: rawId, mono: true },
  ];
  if (formId) items.push({ label: "Form ID", value: formId, mono: true });
  if (status) items.push({ label: "Status", value: status });
  if (ip) items.push({ label: "Source IP", value: ip, mono: true });

  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {item.label}
          </dt>
          <dd
            className={[
              "mt-0.5 truncate text-[var(--navy-900)]",
              item.mono ? "font-mono text-[11px]" : "",
            ].join(" ")}
            title={item.value}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EventDetails({ event }: { event: EventItem }) {
  const rows = collectAnswerRows(event.raw);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--card-border)] bg-[rgba(19,48,107,0.03)] p-3">
        <MetaGrid event={event} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--card-border)] bg-white p-3 text-xs text-[var(--muted)]">
          No structured answers were provided for this submission.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--card-border)] bg-white">
          <table className="w-full table-fixed text-xs">
            <thead className="bg-[rgba(19,48,107,0.04)] text-[var(--navy-700)]">
              <tr>
                <th
                  scope="col"
                  className="w-2/5 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                >
                  Field
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                >
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {rows.map((row, idx) => (
                <tr
                  key={`${row.label}-${idx}`}
                  className="align-top odd:bg-white even:bg-[rgba(19,48,107,0.015)]"
                >
                  <td
                    className="px-3 py-2 font-medium text-[var(--navy-900)] break-words"
                    title={row.label}
                  >
                    {row.label}
                  </td>
                  <td className="px-3 py-2 text-[var(--navy-900)] break-words whitespace-pre-wrap">
                    {row.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

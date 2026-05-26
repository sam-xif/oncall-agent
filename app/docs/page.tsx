import staff from "@/lib/staff.json";
import Link from "next/link";

export const metadata = {
  title: "Team Docs — On-Call Agent",
  description: "Staff responsibilities and on-call expertise",
};

const TIER_LABEL: Record<string, string> = {
  primary: "Primary On-Call",
  escalation: "Escalation",
};

const TIER_COLOR: Record<string, string> = {
  primary: "text-[#FF5C28] border-[#FF5C28]/40 bg-[#FF5C28]/10",
  escalation: "text-amber-400 border-amber-400/40 bg-amber-400/10",
};

export default function DocsPage() {
  return (
    <div className="min-h-full bg-black text-white">
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-[#FF5C28]">
              Documentation
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              Team & On-Call Responsibilities
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-400 transition hover:border-[#FF5C28] hover:text-[#FF5C28]"
          >
            ← Back to Agent
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        {staff.employees.map((employee) => (
          <div
            key={employee.slackHandle}
            className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">
                    {employee.name}
                  </h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TIER_COLOR[employee.oncallTier] ?? "text-zinc-400 border-zinc-700 bg-zinc-800"}`}
                  >
                    {TIER_LABEL[employee.oncallTier] ?? employee.oncallTier}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-400">{employee.role}</p>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  @{employee.slackHandle}
                </p>
              </div>
            </div>

            {employee.notes && (
              <p className="mt-4 rounded-lg border border-zinc-800 bg-black/40 px-4 py-3 text-sm text-zinc-300 leading-relaxed">
                {employee.notes}
              </p>
            )}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#FF5C28]">
                  Expertise
                </h3>
                <ul className="space-y-1">
                  {employee.expertise.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF5C28]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {employee.limitations.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                    Escalate for
                  </h3>
                  <ul className="space-y-1">
                    {employee.limitations.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}

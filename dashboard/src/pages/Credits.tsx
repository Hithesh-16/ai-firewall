import { useEffect, useState } from "react";
import { fetchCredits, fetchProviders, type Credit, type ProviderInfo } from "../api";

export default function Credits() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    Promise.all([fetchCredits(), fetchProviders()])
      .then(([c, p]) => {
        setCredits(c);
        setProviders(p);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 py-20 text-center">Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Credit Management</h1>
      <p className="text-slate-400 text-sm mb-6">
        Monitor your AI usage limits. AI Firewall enforces these limits locally to prevent cost overruns.
      </p>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      {credits.length === 0 ? (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 text-sm">
          No credit limits configured. Limits can be set via the management API or CLI.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {credits.map((c) => {
            const provider = providers.find((p) => p.id === c.providerId);
            const pct = c.totalLimit > 0 ? Math.min((c.usedAmount / c.totalLimit) * 100, 100) : 0;
            const isClosing = pct >= 90;
            const isWarning = pct >= 70;

            let colorClass = "bg-blue-500";
            if (isClosing) colorClass = "bg-red-500";
            else if (isWarning) colorClass = "bg-amber-500";

            return (
              <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      {provider ? provider.name : "Global Limit"}
                    </h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {c.limitType} — {c.resetPeriod}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${c.hardLimit ? "border-red-500/30 text-red-400 bg-red-400/5" : "border-slate-700 text-slate-400 bg-slate-800"}`}>
                    {c.hardLimit ? "Hard" : "Soft"}
                  </span>
                </div>

                <div className="mb-2 flex items-end justify-between">
                  <span className="text-lg font-bold text-white">
                    {c.usedAmount.toLocaleString()} <span className="text-xs font-normal text-slate-500">/ {c.totalLimit.toLocaleString()}</span>
                  </span>
                  <span className={`text-xs font-medium ${isClosing ? "text-red-400" : isWarning ? "text-amber-400" : "text-blue-400"}`}>
                    {Math.round(pct)}%
                  </span>
                </div>

                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-4">
                  <div 
                    className={`h-full transition-all duration-500 ${colorClass}`}
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Resets: {new Date(c.resetDate).toLocaleDateString()}</span>
                  <span>{c.totalLimit - c.usedAmount > 0 ? "Remaining" : "Exceeded"}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { fetchUsageSummary, type UsageSummary } from "../api";
import StatCard from "../components/StatCard";

export default function Usage() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetchUsageSummary()
      .then(setUsage)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500 py-20 text-center">Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Usage Statistics</h1>
      <p className="text-slate-400 text-sm mb-6">
        Detailed breakdown of AI usage across all models and providers.
      </p>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      {!usage ? (
        <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 text-sm">
          No usage data recorded yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard label="Total Requests" value={usage.totalRequests.toLocaleString()} />
            <StatCard label="Total Tokens" value={(usage.totalTokens / 1000).toFixed(1) + "k"} />
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Cost</p>
              <p className="text-2xl font-bold text-white">${usage.totalCost.toFixed(4)}</p>
            </div>
          </div>

          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">By Model</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {usage.byModel.map((m) => (
              <div key={m.modelName} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-slate-200">{m.modelName}</span>
                  <span className="text-xs font-mono text-slate-500">{m.requests} req</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-slate-500">
                    Tokens: <span className="text-slate-300">{m.tokens.toLocaleString()}</span>
                  </div>
                  <div className="text-slate-500 text-right">
                    Cost: <span className="text-slate-300">${m.cost.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

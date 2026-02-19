import { useEffect, useState } from "react";
import { fetchStats } from "../api";

const TYPE_COLORS: Record<string, string> = {
  AWS_KEY: "bg-red-500",
  PRIVATE_KEY: "bg-red-600",
  DATABASE_URL: "bg-red-400",
  GITHUB_TOKEN: "bg-orange-500",
  JWT: "bg-amber-500",
  BEARER_TOKEN: "bg-amber-400",
  GENERIC_API_KEY: "bg-yellow-500",
  SLACK_TOKEN: "bg-purple-500",
  GOOGLE_API_KEY: "bg-blue-500",
  AZURE_KEY: "bg-cyan-500",
  HARDCODED_PASSWORD: "bg-pink-500",
  ENV_VARIABLE: "bg-emerald-500",
  HIGH_ENTROPY: "bg-violet-500"
};

export default function SecretTypes() {
  const [secretsByType, setSecretsByType] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetchStats()
      .then((s) => {
        setSecretsByType(s.secretsByType);
        setTotal(Object.values(s.secretsByType).reduce((a, b) => a + b, 0));
      })
      .catch(() => {});
  }, []);

  const sorted = Object.entries(secretsByType).sort(([, a], [, b]) => b - a);
  const maxVal = sorted.length > 0 ? sorted[0][1] : 1;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Secret Types Detected</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-red-400">{total}</p>
          <p className="text-xs text-slate-500 mt-1">Total Secrets Found</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-amber-400">{sorted.length}</p>
          <p className="text-xs text-slate-500 mt-1">Unique Secret Types</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
          <p className="text-4xl font-bold text-blue-400">{sorted[0]?.[0] ?? "—"}</p>
          <p className="text-xs text-slate-500 mt-1">Most Common Type</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-6">Distribution</h3>

        {sorted.length === 0 && (
          <p className="text-sm text-slate-600 text-center py-8">No secrets detected yet</p>
        )}

        <div className="space-y-4">
          {sorted.map(([type, count]) => {
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
            return (
              <div key={type}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="text-slate-300 font-medium">{type}</span>
                  <span className="text-slate-500">{count} ({pct}%)</span>
                </div>
                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${TYPE_COLORS[type] ?? "bg-slate-500"}`}
                    style={{ width: `${(count / maxVal) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

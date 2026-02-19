import { useEffect, useState } from "react";
import { fetchRiskScore, fetchStats } from "../api";
import RiskBadge from "../components/RiskBadge";

export default function RiskScore() {
  const [riskScore, setRiskScore] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<Record<string, number>>({});
  const [secretsByType, setSecretsByType] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchRiskScore()
      .then((r) => { setRiskScore(r.riskScore); setBreakdown(r.breakdown); })
      .catch(() => {});
    fetchStats()
      .then((s) => setSecretsByType(s.secretsByType))
      .catch(() => {});
  }, []);

  const riskLevel = riskScore >= 70 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW";
  const riskColor = riskScore >= 70 ? "text-red-400" : riskScore >= 30 ? "text-amber-400" : "text-green-400";
  const ringColor = riskScore >= 70 ? "stroke-red-500" : riskScore >= 30 ? "stroke-amber-500" : "stroke-green-500";
  const pct = Math.min(riskScore, 100);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Project Risk Score</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 flex flex-col items-center justify-center">
          <svg className="w-40 h-40 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#1e293b" strokeWidth="10" />
            <circle
              cx="60" cy="60" r="52" fill="none"
              className={ringColor}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${pct * 3.27} 327`}
            />
          </svg>
          <p className={`text-4xl font-bold mt-4 ${riskColor}`}>{riskScore}</p>
          <p className="text-xs text-slate-500 mt-1">out of 100</p>
          <RiskBadge score={riskScore} size="lg" />
          <p className={`text-sm font-semibold mt-2 ${riskColor}`}>{riskLevel} RISK</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Risk Breakdown</h3>
          <div className="space-y-3">
            {Object.entries(breakdown).length > 0 ? (
              Object.entries(breakdown).map(([key, val]) => (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-sm text-slate-300">{key}</span>
                  <RiskBadge score={val} size="sm" />
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600">No breakdown data</p>
            )}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Secrets by Severity</h3>
          <div className="space-y-3">
            {Object.entries(secretsByType).length > 0 ? (
              Object.entries(secretsByType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">{type}</span>
                    <span className="text-sm font-semibold text-red-400">{count}</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-slate-600">No secrets detected yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-3">Recommendations</h3>
        <ul className="space-y-2 text-sm text-slate-400">
          {riskScore >= 70 && <li className="flex gap-2"><span className="text-red-400">●</span>Critical: Enable smart routing to divert sensitive requests to local LLM</li>}
          {riskScore >= 30 && <li className="flex gap-2"><span className="text-amber-400">●</span>Add frequently-leaked paths to blocked_paths in policy.json</li>}
          <li className="flex gap-2"><span className="text-blue-400">●</span>Enable automatic redaction for all detected PII types</li>
          <li className="flex gap-2"><span className="text-green-400">●</span>Run the AI Leak Simulator to audit your full codebase</li>
        </ul>
      </div>
    </div>
  );
}

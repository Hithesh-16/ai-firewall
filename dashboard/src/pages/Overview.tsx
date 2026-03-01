import { useEffect, useState } from "react";
import { fetchStats, fetchHealth, type StatsResponse } from "../api";
import StatCard from "../components/StatCard";
import BarChart from "../components/BarChart";

export default function Overview() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchHealth().then(setHealthy);
    fetchStats().then(setStats).catch((e) => setErr(e.message));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Overview</h1>
        {healthy !== null && (
          <span className={`flex items-center gap-2 text-xs ${healthy ? "text-green-400" : "text-red-400"}`}>
            <span className={`w-2 h-2 rounded-full ${healthy ? "bg-green-400" : "bg-red-400"}`} />
            {healthy ? "Proxy running" : "Proxy offline"}
          </span>
        )}
      </div>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total Requests" value={stats.totalRequests} />
            <StatCard label="Blocked" value={stats.blocked} color="text-red-400" />
            <StatCard label="Redacted" value={stats.redacted} color="text-amber-400" />
            <StatCard label="Allowed" value={stats.allowed} color="text-green-400" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Block Rate"
              value={stats.totalRequests > 0 ? `${((stats.blocked / stats.totalRequests) * 100).toFixed(1)}%` : "0%"}
              color="text-red-400"
            />
            <StatCard
              label="Redact Rate"
              value={stats.totalRequests > 0 ? `${((stats.redacted / stats.totalRequests) * 100).toFixed(1)}%` : "0%"}
              color="text-amber-400"
            />
            <StatCard label="Avg Risk Score" value={stats.avgRiskScore} color="text-blue-400" />
            <StatCard
              label="Clean Rate"
              value={stats.totalRequests > 0 ? `${((stats.allowed / stats.totalRequests) * 100).toFixed(1)}%` : "0%"}
              color="text-green-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BarChart
              title="Requests by Day"
              bars={stats.requestsByDay.slice(-14).map((d) => ({
                label: d.date,
                value: d.count,
                color: "bg-blue-500"
              }))}
            />
            <BarChart
              title="Secrets by Type"
              bars={Object.entries(stats.secretsByType).map(([type, count]) => ({
                label: type,
                value: count,
                color: "bg-red-500"
              }))}
            />
          </div>
        </>
      )}

      {!stats && !err && (
        <div className="text-center text-slate-600 py-20">Loading...</div>
      )}
    </div>
  );
}

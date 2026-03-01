import { useEffect, useState } from "react";
import { fetchLogs, type LogEntry } from "../api";
import ActionBadge from "../components/ActionBadge";
import RiskBadge from "../components/RiskBadge";

export default function Timeline() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => {
    fetchLogs(1, 100)
      .then((res) => setLogs(res.logs))
      .catch(() => {});
  }, []);

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  function fmtDate(ts: number) {
    return new Date(ts).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric"
    });
  }

  const grouped: Record<string, LogEntry[]> = {};
  for (const log of logs) {
    const day = fmtDate(log.timestamp);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(log);
  }

  const lineColor = (action: string) => {
    if (action === "BLOCK") return "bg-red-500";
    if (action === "REDACT") return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Timeline</h1>

      {Object.keys(grouped).length === 0 && (
        <p className="text-sm text-slate-600 text-center py-20">No requests yet</p>
      )}

      {Object.entries(grouped).map(([day, entries]) => (
        <div key={day} className="mb-8">
          <h2 className="text-xs text-slate-500 uppercase tracking-wide mb-4 sticky top-0 bg-slate-950 py-2 z-10">
            {day}
          </h2>

          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-800" />

            {entries.map((log) => (
              <div key={log.id} className="relative mb-4">
                <div className={`absolute left-[-18px] top-2 w-3 h-3 rounded-full border-2 border-slate-950 ${lineColor(log.action)}`} />
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">{fmtTime(log.timestamp)}</span>
                      <ActionBadge action={log.action} />
                      <span className="text-sm text-slate-300">{log.model}</span>
                    </div>
                    <RiskBadge score={log.risk_score} />
                  </div>
                  {(log.secrets_found > 0 || log.pii_found > 0) && (
                    <div className="flex gap-4 text-xs text-slate-500 mt-1">
                      {log.secrets_found > 0 && <span>{log.secrets_found} secret{log.secrets_found > 1 ? "s" : ""}</span>}
                      {log.pii_found > 0 && <span>{log.pii_found} PII</span>}
                      <span>{log.response_time_ms}ms</span>
                    </div>
                  )}
                  {log.reasons && log.reasons !== "[]" && (
                    <p className="text-xs text-slate-500 mt-2">
                      {log.reasons}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

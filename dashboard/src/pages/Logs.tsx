import { useEffect, useState } from "react";
import { fetchLogs, type LogEntry } from "../api";
import ActionBadge from "../components/ActionBadge";
import RiskBadge from "../components/RiskBadge";

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const limit = 25;

  useEffect(() => {
    fetchLogs(page, limit, filter || undefined)
      .then((res) => {
        setLogs(res.logs);
        setTotal(res.total);
      })
      .catch(() => {});
  }, [page, filter]);

  const totalPages = Math.ceil(total / limit);

  function fmtTime(ts: number) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Request Log</h1>
        <div className="flex gap-2">
          {["", "ALLOW", "REDACT", "BLOCK"].map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filter === f
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              {f || "All"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs text-slate-500 uppercase">
              <th className="text-left px-4 py-3">Time</th>
              <th className="text-left px-4 py-3">Model</th>
              <th className="text-left px-4 py-3">Action</th>
              <th className="text-left px-4 py-3">Risk</th>
              <th className="text-left px-4 py-3">Secrets</th>
              <th className="text-left px-4 py-3">PII</th>
              <th className="text-left px-4 py-3">Latency</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <>
                <tr
                  key={log.id}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <td className="px-4 py-3 text-slate-400 text-xs">{fmtTime(log.timestamp)}</td>
                  <td className="px-4 py-3 text-slate-300">{log.model}</td>
                  <td className="px-4 py-3"><ActionBadge action={log.action} /></td>
                  <td className="px-4 py-3"><RiskBadge score={log.risk_score} /></td>
                  <td className="px-4 py-3 text-slate-400">{log.secrets_found}</td>
                  <td className="px-4 py-3 text-slate-400">{log.pii_found}</td>
                  <td className="px-4 py-3 text-slate-500">{log.response_time_ms}ms</td>
                </tr>
                {expanded === log.id && (
                  <tr key={`${log.id}-detail`}>
                    <td colSpan={7} className="px-4 py-4 bg-slate-800/30">
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-slate-500 uppercase mb-1">Provider</p>
                          <p className="text-slate-300">{log.provider}</p>
                        </div>
                        <div>
                          <p className="text-slate-500 uppercase mb-1">Reasons</p>
                          <p className="text-slate-300">{log.reasons || "None"}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-slate-500 uppercase mb-1">Sanitized Text (preview)</p>
                          <pre className="text-slate-400 bg-slate-900 rounded p-2 text-xs max-h-32 overflow-auto whitespace-pre-wrap">
                            {log.sanitized_text.slice(0, 500)}{log.sanitized_text.length > 500 ? "..." : ""}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-600">
                  No requests logged yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-400 disabled:opacity-30"
          >
            Previous
          </button>
          <span className="px-3 py-1.5 text-xs text-slate-500">
            Page {page} of {totalPages} ({total} total)
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-400 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

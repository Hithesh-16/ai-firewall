import { useEffect, useState } from "react";
import { fetchPolicy, updatePolicy, type PolicyConfig } from "../api";

export default function Settings() {
  const [policy, setPolicy] = useState<PolicyConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetchPolicy().then(setPolicy).catch((e) => setErr(e.message));
  }, []);

  function toggle(key: string) {
    if (!policy) return;
    setPolicy({
      ...policy,
      rules: { ...policy.rules, [key]: !policy.rules[key] }
    });
  }

  function setThreshold(val: string) {
    if (!policy) return;
    setPolicy({ ...policy, severity_threshold: val });
  }

  function setBlockedPaths(val: string) {
    if (!policy) return;
    setPolicy({ ...policy, blocked_paths: val.split("\n").filter(Boolean) });
  }

  async function save() {
    if (!policy) return;
    setSaving(true);
    setSaved(false);
    setErr("");
    try {
      const updated = await updatePolicy(policy);
      setPolicy(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!policy && !err) return <div className="text-slate-600 py-20 text-center">Loading...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">Policy Configuration</h1>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      {policy && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Detection Rules</h3>
            <div className="space-y-3">
              {Object.entries(policy.rules).map(([key, val]) => (
                <label key={key} className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                    {key.replace(/_/g, " ")}
                  </span>
                  <button
                    onClick={() => toggle(key)}
                    className={`w-10 h-5 rounded-full transition-colors relative ${
                      val ? "bg-blue-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        val ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Severity Threshold</h3>
              <div className="flex gap-2">
                {["medium", "high", "critical"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setThreshold(t)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                      policy.severity_threshold === t
                        ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Blocked Paths</h3>
              <textarea
                value={policy.blocked_paths.join("\n")}
                onChange={(e) => setBlockedPaths(e.target.value)}
                rows={6}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 font-mono focus:outline-none focus:border-blue-500"
                placeholder="/payments/&#10;/auth/&#10;/.env"
              />
              <p className="text-[10px] text-slate-600 mt-1">One path per line. Requests referencing these paths will be blocked.</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Smart Routing</h3>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-slate-300">Enable smart routing</span>
                <button
                  onClick={() =>
                    setPolicy({
                      ...policy,
                      smart_routing: policy.smart_routing
                        ? { ...policy.smart_routing, enabled: !policy.smart_routing.enabled }
                        : undefined
                    })
                  }
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    policy.smart_routing?.enabled ? "bg-blue-600" : "bg-slate-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      policy.smart_routing?.enabled ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </label>
              {policy.smart_routing && (
                <p className="text-xs text-slate-500 mt-2">
                  Local LLM: {policy.smart_routing.local_llm.provider} / {policy.smart_routing.local_llm.model}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

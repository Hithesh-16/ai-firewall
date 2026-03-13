import { useEffect, useState } from "react";
import {
  fetchMcpServers,
  addMcpServer,
  deleteMcpServer,
  type McpServer
} from "../api";

export default function McpConfig() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    setErr("");
    fetchMcpServers()
      .then(setServers)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    if (!newName.trim() || !newUrl.trim()) return;
    setAdding(true);
    setErr("");
    try {
      await addMcpServer(newName.trim(), newUrl.trim());
      setNewName("");
      setNewUrl("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add server");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Remove MCP server "${name}"?`)) return;
    setErr("");
    try {
      await deleteMcpServer(name);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (loading) return <div className="text-slate-500 py-20 text-center">Loading...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">MCP Servers</h1>
      <p className="text-slate-400 text-sm mb-6">
        Model Context Protocol (MCP) servers provide tools (file I/O, git, database, etc.) to the LLM. 
        All traffic is scanned by the AI Firewall before being forwarded.
      </p>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Add MCP Server</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Server Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. filesystem, github"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Target URL</label>
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="e.g. http://localhost:3001"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={adding || !newName.trim() || !newUrl.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding..." : "Add Server"}
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-2">What are MCP Servers?</h3>
          <div className="text-sm text-slate-400 space-y-3 leading-relaxed">
            <p>
              MCP servers run locally and expose tools (read_file, write_file, list_dir, run_query, etc.) 
              that the AI can call to complete tasks.
            </p>
            <p>
              The AI Firewall acts as a <strong>Security Gateway</strong>. Instead of connecting your AI 
              directly to these tools, you connect to the Firewall, which scans all tool arguments and 
              results for secrets and sensitive data.
            </p>
            <p className="text-xs text-slate-500">
              Popular servers: <strong>filesystem</strong> (Local file I/O), <strong>git</strong> (Repo management), <strong>postgres</strong> (DB access).
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs text-slate-500 uppercase tracking-wide">Configured Servers</h3>
        {servers.length === 0 ? (
          <div className="bg-slate-900/50 border border-dashed border-slate-800 rounded-xl p-10 text-center text-slate-500 text-sm">
            No MCP servers configured yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {servers.map((s) => (
              <div key={s.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-200">{s.name}</span>
                    <span className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wider ${s.online ? "text-green-400" : "text-red-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.online ? "bg-green-400" : "bg-red-400"}`}></span>
                      {s.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate mb-4">{s.targetUrl}</p>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => handleDelete(s.name)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

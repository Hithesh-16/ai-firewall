import { useEffect, useState } from "react";
import {
  fetchProviders,
  fetchModels,
  addProvider,
  addModel,
  deleteProvider,
  fetchModelCatalog,
  type ProviderInfo,
  type ModelInfo,
  type CatalogProvider
} from "../api";

const PRESETS = [
  { name: "Groq (Llama free)", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  { name: "Anthropic", baseUrl: "https://api.anthropic.com" },
  { name: "x.ai (Grok)", baseUrl: "https://api.x.ai/v1" }
];

export default function Providers() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [addName, setAddName] = useState("");
  const [addBaseUrl, setAddBaseUrl] = useState("");
  const [addApiKey, setAddApiKey] = useState("");
  const [adding, setAdding] = useState(false);

  const [modelProviderId, setModelProviderId] = useState<number>(0);
  const [modelName, setModelName] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  function load() {
    setLoading(true);
    setErr("");
    Promise.all([fetchProviders(), fetchModels(), fetchModelCatalog()])
      .then(([p, m, c]) => {
        setProviders(p);
        setModels(m);
        setCatalog(c);
        if (p.length > 0 && !modelProviderId) setModelProviderId(p[0].id);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function applyPreset(name: string, baseUrl: string) {
    setAddName(name);
    setAddBaseUrl(baseUrl);
  }

  async function handleAddProvider() {
    if (!addName.trim() || !addBaseUrl.trim() || !addApiKey.trim()) return;
    setAdding(true);
    setErr("");
    try {
      await addProvider(addName.trim(), addApiKey.trim(), addBaseUrl.trim());
      setAddName("");
      setAddBaseUrl("");
      setAddApiKey("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add provider");
    } finally {
      setAdding(false);
    }
  }

  async function handleAddModel(name?: string) {
    const finalName = name || modelName.trim();
    if (!finalName || !modelProviderId) return;
    setAddingModel(true);
    setErr("");
    try {
      await addModel(modelProviderId, finalName, {
        inputCostPer1k: 0,
        outputCostPer1k: 0
      });
      if (!name) setModelName("");
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add model");
    } finally {
      setAddingModel(false);
    }
  }

  async function handleDeleteProvider(id: number) {
    if (!confirm("Delete this provider and its models?")) return;
    setErr("");
    try {
      await deleteProvider(id);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  if (loading) return <div className="text-slate-500 py-20 text-center">Loading...</div>;

  const modelsByProvider = providers.map((p) => ({
    provider: p,
    models: models.filter((m) => m.providerId === p.id)
  }));

  // Find models in catalog for selected provider
  const selectedProvider = providers.find(p => p.id === modelProviderId);
  const catalogModels = catalog.find(cp => 
    selectedProvider && (selectedProvider.baseUrl === cp.baseUrl || selectedProvider.name.toLowerCase().includes(cp.slug.split('-')[0]))
  )?.models || [];

  const registeredModelNames = new Set(models.filter(m => m.providerId === modelProviderId).map(m => m.modelName));
  const availableCatalogModels = catalogModels.filter(m => !registeredModelNames.has(m.modelName));

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">Providers &amp; Models</h1>
      <p className="text-slate-400 text-sm mb-6">
        Configure AI providers and models. Use Groq for free Llama. Then add models from the catalog or manually.
      </p>

      {err && <p className="text-red-400 text-sm mb-4">{err}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Add provider</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {PRESETS.map((pre) => (
              <button
                key={pre.name}
                type="button"
                onClick={() => applyPreset(pre.name, pre.baseUrl)}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg hover:bg-slate-700 transition-colors"
              >
                {pre.name}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Groq, OpenAI"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Base URL</label>
              <input
                type="url"
                value={addBaseUrl}
                onChange={(e) => setAddBaseUrl(e.target.value)}
                placeholder="https://api.groq.com/openai/v1"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">API Key</label>
              <input
                type="password"
                value={addApiKey}
                onChange={(e) => setAddApiKey(e.target.value)}
                placeholder="Paste your API key"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleAddProvider}
              disabled={adding || !addName.trim() || !addBaseUrl.trim() || !addApiKey.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {adding ? "Adding..." : "Add Provider"}
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Add model</h3>
          {providers.length === 0 ? (
            <p className="text-slate-500 text-sm">Add a provider first.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">1. Select Provider</label>
                <select
                  value={modelProviderId}
                  onChange={(e) => setModelProviderId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {availableCatalogModels.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-2">2a. Quick Add from Catalog</label>
                  <div className="space-y-2 max-height-[200px] overflow-y-auto pr-1">
                    {availableCatalogModels.map((cm) => (
                      <div key={cm.modelName} className="flex items-center justify-between gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-800">
                        <div>
                          <div className="text-xs font-medium text-slate-200">{cm.displayName}</div>
                          <div className="text-[10px] text-slate-500">{Math.round(cm.maxContextTokens/1000)}k ctx</div>
                        </div>
                        <button
                          onClick={() => handleAddModel(cm.modelName)}
                          disabled={addingModel}
                          className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-[10px] rounded transition-colors"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-500 mb-1">2b. Manual Entry</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g. llama-3.1-8b-instant"
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddModel()}
                    disabled={addingModel || !modelName.trim()}
                    className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors"
                  >
                    {addingModel ? "..." : "Add"}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                  For cloud providers, manual entry is only allowed for models already in our trusted catalog.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">Your providers &amp; models</h3>
        {providers.length === 0 ? (
          <p className="text-slate-500 text-sm">No providers yet. Add one above.</p>
        ) : (
          <div className="space-y-4">
            {modelsByProvider.map(({ provider, models: provModels }) => (
              <div key={provider.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-slate-200">{provider.name}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase tracking-wider ${provider.enabled ? "text-green-400" : "text-slate-500"}`}>
                      {provider.enabled ? "enabled" : "disabled"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteProvider(provider.id)}
                      className="text-[10px] text-red-500 hover:text-red-400 uppercase tracking-wider"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mb-3 font-mono">{provider.baseUrl}</p>
                <div className="flex flex-wrap gap-2">
                  {provModels.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No models added yet</span>
                  ) : (
                    provModels.map((m) => (
                      <span
                        key={m.id}
                        className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 text-[10px] rounded"
                      >
                        {m.displayName || m.modelName}
                      </span>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

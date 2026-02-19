type Bar = { label: string; value: number; color?: string };
type Props = { bars: Bar[]; maxValue?: number; title?: string };

export default function BarChart({ bars, maxValue, title }: Props) {
  const max = maxValue ?? Math.max(...bars.map((b) => b.value), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      {title && <h3 className="text-xs text-slate-500 uppercase tracking-wide mb-4">{title}</h3>}
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-300">{bar.label}</span>
              <span className="text-slate-500">{bar.value}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${bar.color ?? "bg-blue-500"}`}
                style={{ width: `${Math.min((bar.value / max) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
        {bars.length === 0 && <p className="text-sm text-slate-600">No data yet</p>}
      </div>
    </div>
  );
}

type Props = { score: number; size?: "sm" | "md" | "lg" };

export default function RiskBadge({ score, size = "sm" }: Props) {
  let color = "bg-green-500/20 text-green-400 border-green-500/30";
  if (score >= 70) color = "bg-red-500/20 text-red-400 border-red-500/30";
  else if (score >= 30) color = "bg-amber-500/20 text-amber-400 border-amber-500/30";

  const sizeClass = size === "lg" ? "text-sm px-3 py-1" : size === "md" ? "text-xs px-2.5 py-0.5" : "text-[10px] px-2 py-0.5";

  return (
    <span className={`inline-block rounded-full border font-semibold ${color} ${sizeClass}`}>
      {score}
    </span>
  );
}

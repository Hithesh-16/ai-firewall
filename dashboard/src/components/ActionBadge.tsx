type Props = { action: "ALLOW" | "BLOCK" | "REDACT" };

const styles: Record<string, string> = {
  ALLOW: "bg-green-500/20 text-green-400 border-green-500/30",
  BLOCK: "bg-red-500/20 text-red-400 border-red-500/30",
  REDACT: "bg-amber-500/20 text-amber-400 border-amber-500/30"
};

export default function ActionBadge({ action }: Props) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full border ${styles[action] ?? styles.ALLOW}`}>
      {action}
    </span>
  );
}

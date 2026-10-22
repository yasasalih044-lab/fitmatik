export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-8 place-items-center rounded-lg bg-ink font-display text-lg font-extrabold text-bg">M</span>
      <span className="leading-none">
        <span className="block font-display text-[15px] font-bold tracking-tight">Mavros Studio</span>
        <span className="block text-[11px] tracking-wide text-faint">mavrosai · Jett Social Media</span>
      </span>
    </div>
  );
}

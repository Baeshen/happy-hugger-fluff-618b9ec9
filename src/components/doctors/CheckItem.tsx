export function CheckItem({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer hover:text-primary transition-colors group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-border accent-primary h-4 w-4"
      />
      <span className={checked ? "font-medium text-primary" : ""}>{label}</span>
    </label>
  );
}

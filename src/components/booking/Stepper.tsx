import { Check } from "lucide-react";

export function Stepper({ steps, current, onJump }: { steps: string[]; current: number; onJump: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-1 overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={i} className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={n >= current}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                active ? "bg-primary text-primary-foreground shadow"
                : done ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-5 w-5 rounded-full grid place-items-center text-[10px] ${
                active ? "bg-primary-foreground text-primary" : done ? "bg-primary text-primary-foreground" : "bg-background"
              }`}>
                {done ? <Check className="h-3 w-3"/> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && <span className="text-muted-foreground/50">·</span>}
          </li>
        );
      })}
    </ol>
  );
}

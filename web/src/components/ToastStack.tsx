import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import type { ToastItem } from "../hooks/useCadenceSocket";

interface Props {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export function ToastStack({ toasts, onDismiss }: Props) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => {
        const icon =
          toast.level === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : toast.level === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          ) : (
            <Info className="h-4 w-4 shrink-0 text-violet-400" />
          );

        const borderClass =
          toast.level === "error"
            ? "border-rose-500/30 bg-zinc-900/95"
            : toast.level === "success"
              ? "border-emerald-500/30 bg-zinc-900/95"
              : "border-white/10 bg-zinc-900/95";

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm text-zinc-100 shadow-xl backdrop-blur-md ${borderClass}`}
          >
            <div className="mt-0.5">{icon}</div>
            <p className="flex-1 leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

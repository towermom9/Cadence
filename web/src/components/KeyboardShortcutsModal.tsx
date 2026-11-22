import { X } from "lucide-react";

interface ShortcutItem {
  label: string;
  keys: string;
}

interface Props {
  open: boolean;
  stepSeconds?: number;
  onClose: () => void;
}

function ShortcutSection({ title, items }: { title: string; items: ShortcutItem[] }) {
  return (
    <div>
      <h3 className="mb-3 text-lg font-bold text-white">{title}</h3>
      <div className="divide-y divide-white/10 border-t border-white/10">
        {items.map((item) => (
          <div
            key={`${title}-${item.label}`}
            className="flex items-center justify-between gap-4 py-2.5 text-sm"
          >
            <span className="text-zinc-300">{item.label}</span>
            <span className="shrink-0 text-right font-mono text-xs font-semibold text-white">
              {item.keys}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KeyboardShortcutsModal({ open, stepSeconds = 10, onClose }: Props) {
  if (!open) return null;

  const playbackItems: ShortcutItem[] = [
    { label: "Play/Pause", keys: "SPACE or ;" },
    { label: "Next song", keys: "j or SHIFT + n" },
    { label: "Previous song", keys: "k or SHIFT + p" },
    { label: `Forward ${stepSeconds}s`, keys: "l or SHIFT + right arrow" },
    { label: `Back ${stepSeconds}s`, keys: "h or SHIFT + left arrow" },
    { label: "Forward 1s", keys: "SHIFT + l or CTRL + SHIFT + right arrow" },
    { label: "Back 1s", keys: "SHIFT + h or CTRL + SHIFT + left arrow" },
    { label: "Shuffle queue", keys: "s" },
    { label: "Toggle repeat", keys: "r" },
  ];

  const navigationItems: ShortcutItem[] = [
    { label: "Go to Home", keys: "gh" },
    { label: "Go to Explore", keys: "ge" },
    { label: "Go to Library", keys: "gl" },
    { label: "Go to Settings", keys: "g," },
    { label: "Search", keys: "/" },
  ];

  const generalItems: ShortcutItem[] = [
    { label: "Increase volume", keys: "=" },
    { label: "Decrease volume", keys: "-" },
    { label: "Toggle mute", keys: "m" },
    { label: "Toggle queue/expanded player", keys: "q or ESC" },
    { label: "Toggle full screen", keys: "f" },
    { label: "Like current song", keys: "+" },
    { label: "Keyboard shortcuts", keys: "SHIFT + /" },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/12 bg-[#212121] p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-white">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <div className="space-y-8">
            <ShortcutSection title="Playback" items={playbackItems} />
            <ShortcutSection title="Navigation" items={navigationItems} />
          </div>
          <div>
            <ShortcutSection title="General" items={generalItems} />
          </div>
        </div>
      </div>
    </div>
  );
}

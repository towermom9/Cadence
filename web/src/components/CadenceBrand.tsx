import type { CSSProperties } from "react";

function maskStyle(src: string): CSSProperties {
  return {
    maskImage: `url(${src})`,
    WebkitMaskImage: `url(${src})`,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
}

export function CadenceIcon({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      aria-label="Cadence"
      className={`relative inline-block shrink-0 select-none ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--cadence-accent)] transition-colors duration-200"
        style={maskStyle("/brand/icon-accent-mask.png")}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--cadence-accent-fg)] transition-colors duration-200"
        style={maskStyle("/brand/icon-inner-mask.png")}
      />
    </span>
  );
}

export function CadenceBanner({ className = "h-7" }: { className?: string }) {
  return (
    <span
      aria-label="Cadence"
      className={`relative inline-block aspect-[1024/361] shrink-0 select-none ${className}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--cadence-accent)] transition-colors duration-200"
        style={maskStyle("/brand/banner-accent-mask.png")}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-[var(--cadence-accent-fg)] transition-colors duration-200"
        style={maskStyle("/brand/banner-inner-mask.png")}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-white"
        style={maskStyle("/brand/banner-text-mask.png")}
      />
    </span>
  );
}

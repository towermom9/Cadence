import { useEffect, useState } from "react";

export interface DeviceDetectionEnv {
  userAgent?: string;
  innerWidth?: number;
  innerHeight?: number;
  maxTouchPoints?: number;
  hasFinePointer?: boolean;
}

export function detectSupportsKeyboardShortcuts(env?: DeviceDetectionEnv): boolean {
  const ua =
    env?.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const innerWidth =
    env?.innerWidth ??
    (typeof window !== "undefined" ? window.innerWidth : 1280);
  const innerHeight =
    env?.innerHeight ??
    (typeof window !== "undefined" ? window.innerHeight : 800);
  const maxTouchPoints =
    env?.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0);
  const hasFinePointer =
    env?.hasFinePointer ??
    (typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(any-pointer: fine)").matches
      : true);

  if (hasFinePointer) return true;

  const isTabletUa =
    /iPad|Tablet|PlayBook|Silk/i.test(ua) ||
    (/Macintosh/i.test(ua) && maxTouchPoints > 1) ||
    (/Android/i.test(ua) && !/Mobile/i.test(ua));
  if (isTabletUa) return true;

  if (Math.min(innerWidth, innerHeight) >= 600 || innerWidth >= 768) {
    return true;
  }

  return false;
}

export function useShowKeyboardShortcuts(): boolean {
  const [supported, setSupported] = useState<boolean>(() =>
    detectSupportsKeyboardShortcuts()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setSupported(detectSupportsKeyboardShortcuts());
    update();

    window.addEventListener("resize", update);
    const mq =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(any-pointer: fine)")
        : null;
    if (mq && typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
    }

    return () => {
      window.removeEventListener("resize", update);
      if (mq && typeof mq.removeEventListener === "function") {
        mq.removeEventListener("change", update);
      }
    };
  }, []);

  return supported;
}

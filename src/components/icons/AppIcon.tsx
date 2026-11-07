import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Custom icon family modelled on the supplied home-icon reference:
 * soft rounded silhouettes, light lilac gradient fill, optional rounded tile
 * with a violet→blue luminous edge. Use only these icons for app features.
 */
export type AppIconName =
  | "home"
  | "community"
  | "settings"
  | "assistant"
  | "competition"
  | "leaderboard"
  | "streak"
  | "physics"
  | "chemistry"
  | "lessons"
  | "practice"
  | "achievements"
  | "mistakes"
  | "profile"
  | "more";

const glyphs: Record<AppIconName, (fill: string) => ReactNode> = {
  home: (f) => (
    <>
      <path d="M3.2 11.2 12 3.8l8.8 7.4" fill="none" stroke={f} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="4.5" width="2.4" height="4.2" rx="0.8" fill={f} />
      <path d="M5.6 11.6 12 6.4l6.4 5.2v7.6a1.4 1.4 0 0 1-1.4 1.4h-3.1v-5h-3.8v5H7a1.4 1.4 0 0 1-1.4-1.4z" fill={f} />
    </>
  ),
  community: (f) => (
    <>
      <circle cx="9" cy="8.2" r="3.4" fill={f} />
      <path d="M2.8 19.2c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6c0 .6-.5 1-1 1H3.8c-.6 0-1-.4-1-1z" fill={f} />
      <circle cx="16.6" cy="9" r="2.6" fill={f} opacity="0.7" />
      <path d="M16.4 13.4c2.8 0 4.8 1.8 4.8 4.6 0 .5-.4.9-.9.9h-3.6c0-2-.6-3.8-1.9-5.1.5-.3 1-.4 1.6-.4z" fill={f} opacity="0.7" />
    </>
  ),
  settings: (f) => (
    <path
      fillRule="evenodd"
      d="M10.4 2.6h3.2l.5 2.4a7.4 7.4 0 0 1 1.9 1.1l2.3-.8 1.6 2.8-1.8 1.6a7.6 7.6 0 0 1 0 2.2l1.8 1.6-1.6 2.8-2.3-.8a7.4 7.4 0 0 1-1.9 1.1l-.5 2.4h-3.2l-.5-2.4a7.4 7.4 0 0 1-1.9-1.1l-2.3.8-1.6-2.8 1.8-1.6a7.6 7.6 0 0 1 0-2.2L4.1 8.1l1.6-2.8 2.3.8A7.4 7.4 0 0 1 9.9 5zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z"
      fill={f}
    />
  ),
  assistant: (f) => (
    <>
      <path d="M5 4.5h14a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2h-6.4l-4.2 3.3c-.5.4-1.2 0-1.2-.6v-2.7H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" fill={f} />
      <path d="M12 7.4l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z" fill="var(--background)" opacity="0.85" />
    </>
  ),
  competition: (f) => (
    <>
      <path d="M7 3.5h10v5.2a5 5 0 0 1-10 0z" fill={f} />
      <path d="M7 5.2H4.3v1.6A3.6 3.6 0 0 0 7.6 10.4M17 5.2h2.7v1.6a3.6 3.6 0 0 1-3.3 3.6" fill="none" stroke={f} strokeWidth="1.8" strokeLinecap="round" />
      <rect x="10.8" y="13" width="2.4" height="3.6" rx="0.6" fill={f} />
      <rect x="7.4" y="16.6" width="9.2" height="3.6" rx="1.2" fill={f} />
    </>
  ),
  leaderboard: (f) => (
    <>
      <rect x="9" y="5" width="6" height="15" rx="1.4" fill={f} />
      <rect x="2.8" y="10" width="5.4" height="10" rx="1.4" fill={f} opacity="0.75" />
      <rect x="15.8" y="12.5" width="5.4" height="7.5" rx="1.4" fill={f} opacity="0.6" />
    </>
  ),
  streak: (f) => (
    <path d="M12.6 2.8c.4 3 2.4 4.4 3.9 6.2a7 7 0 0 1 1.9 4.9 6.4 6.4 0 0 1-12.8 0c0-2.2 1-3.9 2.4-5.2.2 1.6.9 2.7 2 3.2-.4-3.4 1-6.4 2.6-9.1zM12 20a2.8 2.8 0 0 0 2.8-2.8c0-1.6-1.2-2.6-2.4-3.8-.2 1.2-.8 1.8-1.6 2.2a2.8 2.8 0 0 0 1.2 4.4z" fill={f} fillRule="evenodd" />
  ),
  physics: (f) => (
    <>
      <circle cx="12" cy="12" r="2.4" fill={f} />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" fill="none" stroke={f} strokeWidth="1.8" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" fill="none" stroke={f} strokeWidth="1.8" transform="rotate(60 12 12)" />
      <ellipse cx="12" cy="12" rx="9" ry="3.8" fill="none" stroke={f} strokeWidth="1.8" transform="rotate(-60 12 12)" />
    </>
  ),
  chemistry: (f) => (
    <>
      <path d="M9.2 3h5.6v1.8h-1v4.6l5.4 8.4A2.2 2.2 0 0 1 17.3 21H6.7a2.2 2.2 0 0 1-1.9-3.2l5.4-8.4V4.8h-1z" fill={f} />
      <path d="M7.6 15.6h8.8l1.6 2.6H6z" fill="var(--background)" opacity="0.35" />
    </>
  ),
  lessons: (f) => (
    <>
      <path d="M3 5.4c2.8-1 5.6-.8 8.2.8v13.4c-2.6-1.4-5.4-1.6-8.2-.6z" fill={f} />
      <path d="M21 5.4c-2.8-1-5.6-.8-8.2.8v13.4c2.6-1.4 5.4-1.6 8.2-.6z" fill={f} opacity="0.75" />
    </>
  ),
  practice: (f) => (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2.6" fill={f} />
      <path d="M8 9.2l1.6 1.6L12.8 7.6M8 15.2l1.6 1.6 3.2-3.2" fill="none" stroke="var(--background)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      <rect x="14.2" y="8.6" width="3" height="1.6" rx="0.8" fill="var(--background)" opacity="0.6" />
      <rect x="14.2" y="14.6" width="3" height="1.6" rx="0.8" fill="var(--background)" opacity="0.6" />
    </>
  ),
  mistakes: (f) => (
    <>
      <path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill={f} />
      <path d="M12 7.2v6" fill="none" stroke="var(--background)" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      <circle cx="12" cy="16.4" r="1.2" fill="var(--background)" opacity="0.85" />
    </>
  ),
  achievements: (f) => (
    <>
      <path d="M7.4 2.8h9.2l-2 5.6H9.4z" fill={f} opacity="0.7" />
      <circle cx="12" cy="14.6" r="6.4" fill={f} />
      <path d="M12 11l1.1 2.2 2.4.3-1.8 1.7.5 2.4-2.2-1.2-2.2 1.2.5-2.4-1.8-1.7 2.4-.3z" fill="var(--background)" opacity="0.75" />
    </>
  ),
  profile: (f) => (
    <>
      <circle cx="12" cy="8" r="4.2" fill={f} />
      <path d="M4 19.6c0-3.8 3.6-6.4 8-6.4s8 2.6 8 6.4c0 .6-.4 1-1 1H5c-.6 0-1-.4-1-1z" fill={f} />
    </>
  ),
  more: (f) => (
    <>
      <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="2.2" fill={f} />
      <rect x="13.1" y="3.5" width="7.4" height="7.4" rx="2.2" fill={f} opacity="0.75" />
      <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="2.2" fill={f} opacity="0.75" />
      <rect x="13.1" y="13.1" width="7.4" height="7.4" rx="3.7" fill={f} />
    </>
  ),
};

export function AppIcon({
  name,
  size = 24,
  tile = false,
  className,
  label,
}: {
  name: AppIconName;
  size?: number;
  tile?: boolean;
  className?: string;
  label?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const fill = `url(#g${gid})`;
  const svg = (
    <svg
      width={tile ? size * 0.56 : size}
      height={tile ? size * 0.56 : size}
      viewBox="0 0 24 24"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={tile ? undefined : className}
    >
      <defs>
        <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.97 0.02 295)" />
          <stop offset="1" stopColor="oklch(0.82 0.07 290)" />
        </linearGradient>
      </defs>
      {glyphs[name](fill)}
    </svg>
  );
  if (!tile) return svg;
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center bg-tile glow-edge", className)}
      style={{ width: size, height: size, borderRadius: size * 0.3 }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: size * 0.3,
          padding: 1,
          background: "var(--gradient-edge)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      {svg}
    </span>
  );
}

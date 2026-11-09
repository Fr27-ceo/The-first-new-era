import logo from "@/assets/logo-glasses.png";
import { cn } from "@/lib/utils";

export const BRAND_NAME = 'The first "new era"';
export const BRAND_NAME_AR = "العصر الجديد الأول";

/** شعار النظارة، مقصوص من أيقونة التطبيق. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <img
      src={logo}
      alt={BRAND_NAME}
      width={406}
      height={186}
      className={cn(
        "h-7 w-auto select-none mix-blend-screen brightness-110 contrast-125 drop-shadow-[0_0_16px_var(--violet)]",
        className,
      )}
      draggable={false}
    />
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <LogoMark className="h-6 shrink-0 sm:h-7" />
      {!compact && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-display text-sm font-semibold text-foreground">
            {BRAND_NAME_AR}
          </span>
          <span dir="ltr" className="truncate text-[11px] text-muted-foreground">
            {BRAND_NAME}
          </span>
        </span>
      )}
    </span>
  );
}

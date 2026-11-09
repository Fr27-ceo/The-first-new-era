import type { AppIconName } from "@/components/icons/AppIcon";

export type NavItem = {
  to:
    | "/app"
    | "/app/subjects"
    | "/app/exams"
    | "/app/assistant"
    | "/app/competition"
    | "/app/community"
    | "/app/mistakes"
    | "/app/profile"
    | "/app/settings";
  label: string;
  icon: AppIconName;
  exact?: boolean;
};

/** Single source of truth for app navigation (sidebar, rail, bottom bar). */
export const primaryNav: NavItem[] = [
  { to: "/app", label: "الرئيسية", icon: "home", exact: true },
  { to: "/app/subjects", label: "المواد", icon: "lessons" },
  { to: "/app/exams", label: "الامتحانات", icon: "exams" },
  { to: "/app/assistant", label: "المساعد الذكي", icon: "assistant" },
  { to: "/app/competition", label: "المنافسة", icon: "competition" },
  { to: "/app/community", label: "المجتمع", icon: "community" },
];

export const secondaryNav: NavItem[] = [
  { to: "/app/mistakes", label: "دفتر الأخطاء", icon: "mistakes" },
  { to: "/app/profile", label: "الملف الشخصي", icon: "profile" },
  { to: "/app/settings", label: "الإعدادات", icon: "settings" },
];

/** Phone bottom bar: 4 primary destinations + "More". */
export const mobileNav: NavItem[] = primaryNav.slice(0, 4);

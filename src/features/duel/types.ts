export type DuelOption = { id: string; label: string };
export type DuelMode = "points" | "speed" | "penalties";
export type PackScope = "subject" | "unit" | "lesson";
export type GhostLevel = "beginner" | "pro" | "champion";

export type Pack = {
  scope: PackScope;
  id: string | null;
  title: string;
  group: string;
  count: number;
};

export type Round = {
  index: number;
  correct_label: string;
  explanation: string | null;
  mine: { is_correct: boolean; points: number } | null;
  theirs: { is_correct: boolean; points: number } | null;
};

export type DuelState = {
  id: string;
  code: string;
  status: "waiting" | "active" | "finished" | "cancelled";
  mode: DuelMode;
  total: number;
  sudden_death: boolean;
  index: number;
  started_at: number | null;
  server_now: number;
  time_limit: number;
  my_score: number;
  opp_score: number;
  opp_name: string | null;
  me_answered: boolean;
  opp_answered: boolean;
  my_wrong: number;
  opp_count: number;
  my_kicks: boolean[];
  opp_kicks: boolean[];
  question: { id: string; prompt: string; options: DuelOption[] } | null;
  prev: Round | null;
  winner: "me" | "opp" | null;
  xp: number;
};

export const MODES: { key: DuelMode; label: string; rules: string; min: number }[] = [
  {
    key: "points",
    label: "النقاط",
    min: 7,
    rules:
      "سبعة أسئلة تظهر للطرفين معًا، 20 ثانية لكل سؤال. الإجابة الصحيحة 100 نقطة ومعها مكافأة سرعة حتى 50.",
  },
  {
    key: "speed",
    label: "السرعة",
    min: 5,
    rules: "خمسة أسئلة يحلها كل طالب بسرعته. يفوز صاحب أقل زمن معدّل، وكل خطأ يضيف 5 ثوانٍ.",
  },
  {
    key: "penalties",
    label: "ضربات الجزاء",
    min: 5,
    rules:
      "خمس ركلات، والإجابة الصحيحة هدف. إن تعادلتما يبدأ موت مفاجئ بحد أقصى ثلاث ركلات إضافية.",
  },
];

export const GHOST_LEVELS: { key: GhostLevel; label: string }[] = [
  { key: "beginner", label: "شبح مبتدئ" },
  { key: "pro", label: "شبح محترف" },
  { key: "champion", label: "شبح البطل" },
];

export const packKeyOf = (p: { scope: PackScope; id: string | null }) => `${p.scope}:${p.id ?? ""}`;
export function parsePackKey(key: string): { scope: PackScope; pack: string | null } {
  const [scope, id] = key.split(":");
  return { scope: (scope as PackScope) || "subject", pack: id || null };
}
export const modeMin = (mode: DuelMode) => MODES.find((m) => m.key === mode)?.min ?? 5;

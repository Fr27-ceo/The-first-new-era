import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { conceptPracticeQuery } from "@/features/student/queries";
import { completePracticeSession } from "@/features/practice/practice.functions";
import { Card, MathTex, PageHeader, ProgressRing, StatusBadge } from "@/components/common";
import { AppIcon } from "@/components/icons/AppIcon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/practice/$conceptId")({
  head: () => ({
    meta: [
      { title: "تدريب — العصر الجديد الأول" },
      { name: "description", content: "تدريب مركّز على مفهوم واحد." },
    ],
  }),
  loader: async ({ context, params }) => {
    const c = await context.queryClient.ensureQueryData(conceptPracticeQuery(params.conceptId));
    if (!c) throw notFound();
  },
  component: Practice,
});

type Result = Awaited<ReturnType<typeof completePracticeSession>>;

function Practice() {
  const { conceptId } = Route.useParams();
  const { data: c } = useSuspenseQuery(conceptPracticeQuery(conceptId));
  const submit = useServerFn(completePracticeSession);
  const qc = useQueryClient();
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  if (!c) return null;
  const questions = c.questions;
  const q = questions[idx];
  const isLast = idx === questions.length - 1;

  async function finish() {
    setBusy(true);
    try {
      const r = await submit({
        data: {
          conceptId,
          answers: questions.map((x) => ({ questionId: x.id, optionId: answers[x.id] })),
        },
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ["student"] });
      qc.invalidateQueries({ queryKey: ["competition"] });
      r.newAchievements.forEach((a) => toast.success(`إنجاز جديد: ${a}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر حفظ الجلسة");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setResult(null);
    setAnswers({});
    setIdx(0);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={c.title_ar}
        subtitle={c.lessons?.title_ar}
        icon="practice"
        actions={c.origin === "demo" ? <StatusBadge tone="demo" /> : undefined}
      />
      {c.formula_tex && (
        <div className="mb-6">
          <MathTex tex={c.formula_tex} block />
        </div>
      )}

      {!result && q && (
        <Card className="animate-rise" key={q.id}>
          <div className="mb-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              سؤال {idx + 1} من {questions.length}
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-brand transition-all duration-500"
                style={{ width: `${((idx + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>
          <p className="mb-5 text-lg leading-8">{q.prompt_ar}</p>
          <div role="radiogroup" className="grid gap-3">
            {[...q.question_options]
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((o) => (
                <button
                  key={o.id}
                  role="radio"
                  aria-checked={answers[q.id] === o.id}
                  onClick={() => setAnswers((p) => ({ ...p, [q.id]: o.id }))}
                  className={cn(
                    "press min-h-12 rounded-xl border border-input px-4 py-3 text-start",
                    answers[q.id] === o.id
                      ? "border-primary bg-accent glow-edge"
                      : "hover:bg-muted",
                  )}
                >
                  {o.label_ar}
                </button>
              ))}
          </div>
          <div className="mt-6 flex justify-between gap-3">
            <button
              disabled={idx === 0}
              onClick={() => setIdx(idx - 1)}
              className="press rounded-xl border border-input px-4 py-2.5 text-sm disabled:opacity-40"
            >
              السابق
            </button>
            {isLast ? (
              <button
                disabled={busy || questions.some((x) => !answers[x.id])}
                onClick={finish}
                className="press rounded-xl bg-brand px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                {busy ? "جارٍ التصحيح…" : "إنهاء وتصحيح"}
              </button>
            ) : (
              <button
                disabled={!answers[q.id]}
                onClick={() => setIdx(idx + 1)}
                className="press rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-40"
              >
                التالي
              </button>
            )}
          </div>
        </Card>
      )}

      {result && (
        <div className="space-y-4 animate-rise">
          <Card className="flex flex-wrap items-center gap-6">
            <ProgressRing
              value={result.correct / result.total}
              label={`${result.correct}/${result.total}`}
            />
            <div className="space-y-1">
              <p className="text-lg font-semibold">
                {result.correct === result.total
                  ? "ممتاز! كل الإجابات صحيحة"
                  : "أحسنت المحاولة — راجع أخطاءك"}
              </p>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <AppIcon name="achievements" size={16} /> +{result.xp} نقطة خبرة
              </p>
              {result.qualifying && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AppIcon name="streak" size={16} /> سلسلة التعلم: {result.streak} يوم
                </p>
              )}
            </div>
          </Card>
          <h2 className="font-semibold">مراجعة الإجابات</h2>
          {questions.map((qq, i) => {
            const r = result.review.find((x) => x.questionId === qq.id);
            const chosen = qq.question_options.find((o) => o.id === r?.optionId);
            const right = qq.question_options.find((o) => o.id === r?.correctOptionId);
            return (
              <Card
                key={qq.id}
                className={cn(
                  "border-s-4",
                  r?.isCorrect ? "border-s-success" : "border-s-destructive",
                )}
              >
                <p className="mb-2 font-medium">
                  {i + 1}. {qq.prompt_ar}
                </p>
                <p className="text-sm">
                  إجابتك:{" "}
                  <span className={r?.isCorrect ? "text-success" : "text-destructive"}>
                    {chosen?.label_ar}
                  </span>
                </p>
                {!r?.isCorrect && (
                  <p className="text-sm">
                    الإجابة الصحيحة: <span className="text-success">{right?.label_ar}</span>
                  </p>
                )}
                {r?.explanation && (
                  <p className="mt-2 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">
                    {r.explanation}
                  </p>
                )}
              </Card>
            );
          })}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={restart}
              className="press rounded-xl bg-primary px-5 py-2.5 text-sm text-primary-foreground"
            >
              أعد التدريب
            </button>
            <Link
              to="/app/lessons/$lessonId"
              params={{ lessonId: c.lesson_id }}
              className="press rounded-xl border border-input px-5 py-2.5 text-sm"
            >
              العودة للدرس
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

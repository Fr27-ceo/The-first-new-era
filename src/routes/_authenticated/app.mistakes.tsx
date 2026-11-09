import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Card, EmptyState, PageHeader } from "@/components/common";
import { cn } from "@/lib/utils";
import { getMistakes } from "@/features/mistakes/mistakes.functions";

export const Route = createFileRoute("/_authenticated/app/mistakes")({
  head: () => ({
    meta: [
      { title: "دفتر الأخطاء — العصر الجديد الأول" },
      { name: "description", content: "أخطاؤك مصنّفة بأسبابها مع طريقة علاج كل خطأ." },
    ],
  }),
  component: MistakesPage,
});

function MistakesPage() {
  const load = useServerFn(getMistakes);
  const query = useQuery({
    queryKey: ["mistakes"],
    queryFn: () => load(),
    refetchOnMount: "always",
  });
  const [filter, setFilter] = useState<string>("all");

  const items = query.data?.items ?? [];
  const kinds = [...new Set(items.map((i) => i.cause.kind))];
  const shown = filter === "all" ? items : items.filter((i) => i.cause.kind === filter);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="دفتر الأخطاء"
        subtitle="الأسئلة التي أخطأت فيها مؤخرًا، مصنّفة بسبب الخطأ. تخرج من الدفتر عندما تجيب عنها صحيحًا."
        icon="mistakes"
      />

      {query.isLoading && <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>}
      {query.isError && (
        <p className="text-sm text-destructive">تعذّر تحميل الدفتر. أعد تحديث الصفحة.</p>
      )}

      {query.data && (
        <>
          <div className="grid grid-cols-2 gap-3 text-center">
            <Card className="p-4">
              <p className="text-3xl font-semibold">{items.length}</p>
              <p className="text-xs text-muted-foreground">أخطاء تحتاج مراجعة</p>
            </Card>
            <Card className="p-4">
              <p className="text-3xl font-semibold">{query.data.resolved}</p>
              <p className="text-xs text-muted-foreground">أخطاء تم علاجها</p>
            </Card>
          </div>

          {items.length === 0 ? (
            <Card>
              <EmptyState
                icon="practice"
                title="لا أخطاء مفتوحة"
                body="أجب عن بعض الأسئلة في التدريب أو في التحديات، وستظهر هنا الأسئلة التي تحتاج مراجعة."
              />
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {["all", ...kinds].map((k) => (
                  <button
                    key={k}
                    onClick={() => setFilter(k)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm",
                      filter === k
                        ? "border-primary bg-primary/15"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {k === "all" ? "الكل" : k}
                  </button>
                ))}
              </div>
              <div className="space-y-4">
                {shown.map((m) => (
                  <Card key={m.questionId} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-primary/15 px-3 py-1 text-primary">
                        {m.cause.kind}
                      </span>
                      <span className="text-muted-foreground">{m.lessonTitle}</span>
                      {m.wrongCount > 1 && (
                        <span className="text-muted-foreground">أخطأت فيه {m.wrongCount} مرات</span>
                      )}
                    </div>
                    <p className="leading-8">{m.prompt}</p>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <p className="rounded-xl border border-border px-3 py-2">
                        إجابتك:{" "}
                        <b dir="auto" className="text-destructive">
                          {m.chosenLabel ?? "لم تجب"}
                        </b>
                      </p>
                      <p className="rounded-xl border border-border px-3 py-2">
                        الصحيحة:{" "}
                        <b dir="auto" className="text-success">
                          {m.correctLabel}
                        </b>
                      </p>
                    </div>
                    <p className="text-sm">{m.cause.text}</p>
                    {m.explanation && (
                      <p className="text-sm text-muted-foreground">{m.explanation}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm">
                      <Link
                        to="/app/practice/$conceptId"
                        params={{ conceptId: m.conceptId }}
                        className="press rounded-xl bg-brand px-4 py-2 font-medium text-primary-foreground"
                      >
                        تدرّب على المفهوم
                      </Link>
                      {m.lessonId && (
                        <Link
                          to="/app/lessons/$lessonId"
                          params={{ lessonId: m.lessonId }}
                          className="rounded-xl border border-border px-4 py-2"
                        >
                          راجع الدرس
                        </Link>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

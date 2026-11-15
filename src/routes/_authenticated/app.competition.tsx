import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { leaderboardQuery, studentOverviewQuery } from "@/features/student/queries";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/common";
import { AppIcon } from "@/components/icons/AppIcon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/competition")({
  head: () => ({
    meta: [
      { title: "المنافسة — العصر الجديد الأول" },
      { name: "description", content: "لوحة الترتيب والتحديات والمواسم." },
    ],
  }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(leaderboardQuery),
      context.queryClient.ensureQueryData(studentOverviewQuery),
    ]),
  component: Competition,
});

function Competition() {
  const { data: board } = useSuspenseQuery(leaderboardQuery);
  const { data: me } = useSuspenseQuery(studentOverviewQuery);
  return (
    <div>
      <PageHeader
        title="المنافسة"
        subtitle="الترتيب مبني على نقاط خبرة حقيقية يمنحها الخادم فقط."
        icon="competition"
      />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">نقاطك</p>
          <p className="text-2xl font-semibold">{me.totalXp}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">مستواك</p>
          <p className="text-2xl font-semibold">{me.level.level}</p>
        </Card>
        <Card className="col-span-2 p-4 sm:col-span-1">
          <p className="text-xs text-muted-foreground">ترتيبك</p>
          <p className="text-2xl font-semibold">{board.find((r) => r.is_me)?.rank ?? "—"}</p>
        </Card>
      </div>
      <Tabs defaultValue="leaderboard" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="leaderboard">لوحة الترتيب</TabsTrigger>
          <TabsTrigger value="challenges">التحديات</TabsTrigger>
          <TabsTrigger value="seasons">المواسم</TabsTrigger>
        </TabsList>
        <TabsContent value="leaderboard">
          <Card className="p-2 sm:p-4">
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="flex items-center gap-2 font-semibold">
                <AppIcon name="leaderboard" size={20} /> الترتيب العام
              </h2>
              <span className="text-xs text-muted-foreground">الترتيب حسب المادة: قريبًا</span>
            </div>
            {board.length === 0 ? (
              <EmptyState
                icon="leaderboard"
                title="لا يوجد متنافسون بعد"
                body="أكمل جلسة تدريب لتكون أول اسم في لوحة الترتيب."
              />
            ) : (
              <ol className="divide-y divide-border">
                {board.map((r) => (
                  <li
                    key={r.user_id}
                    className={`flex items-center gap-3 px-2 py-3 ${r.is_me ? "rounded-xl bg-accent" : ""}`}
                  >
                    <span className="w-8 text-center font-semibold text-muted-foreground">
                      {r.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.display_name}
                      {r.is_me && " (أنت)"}
                    </span>
                    <span className="font-medium">{r.total_xp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="challenges">
          <Card className="space-y-3">
            <h2 className="font-semibold">تحدٍّ مباشر</h2>
            <p className="text-sm text-muted-foreground">
              تنافس مع طالب آخر على نفس الأسئلة في نفس اللحظة، أو جرّب وضع الشبح.
            </p>
            <Link
              to="/app/duel"
              className="press inline-flex rounded-xl bg-brand px-5 py-2.5 font-medium text-primary-foreground"
            >
              ادخل التحدي
            </Link>
          </Card>
        </TabsContent>
        <TabsContent value="seasons">
          <Card className="p-2 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
              <div>
                <h2 className="flex items-center gap-2 font-semibold">
                  <AppIcon name="achievements" size={20} /> السكور بورد الأسبوعية
                </h2>
                <p className="text-xs text-muted-foreground">
                  أفضل الطلاب نشاطًا وتقدمًا خلال هذا الأسبوع
                </p>
              </div>
              <StatusBadge tone="verified">تحدي الأسبوع</StatusBadge>
            </div>
            {board.length === 0 ? (
              <EmptyState
                icon="achievements"
                title="لا توجد نقاط أسبوعية بعد"
                body="ابدأ التدريب أو الامتحانات لتتصدر قائمة هذا الأسبوع."
              />
            ) : (
              <ol className="divide-y divide-border">
                {board.slice(0, 15).map((r) => (
                  <li
                    key={r.user_id}
                    className={`flex items-center gap-3 px-2 py-3 ${r.is_me ? "rounded-xl bg-accent" : ""}`}
                  >
                    <span className="w-8 text-center font-semibold text-muted-foreground">
                      #{r.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {r.display_name}
                      {r.is_me && " (أنت)"}
                    </span>
                    <span className="font-medium text-primary">{r.total_xp} XP</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

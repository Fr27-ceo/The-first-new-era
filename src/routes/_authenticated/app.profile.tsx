import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { studentOverviewQuery } from "@/features/student/queries";
import { Card, EmptyState, PageHeader, ProgressRing } from "@/components/common";
import { AppIcon } from "@/components/icons/AppIcon";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({
    meta: [
      { title: "الملف الشخصي — العصر الجديد الأول" },
      { name: "description", content: "تقدمك وإنجازاتك." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentOverviewQuery),
  component: Profile,
});

function Profile() {
  const { data: me } = useSuspenseQuery(studentOverviewQuery);
  return (
    <div>
      <PageHeader
        title={me.displayName}
        subtitle={me.email}
        icon="profile"
        actions={
          <Link
            to="/app/settings"
            className="press rounded-xl border border-input px-4 py-2 text-sm"
          >
            الإعدادات
          </Link>
        }
      />
      <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-3 text-center">
          <ProgressRing value={me.level.progress} label={`م${me.level.level}`} size={120} />
          <p className="text-sm text-muted-foreground">
            {me.level.into}/{me.level.needed} نقطة للمستوى التالي
          </p>
          <div className="grid w-full grid-cols-2 gap-2 pt-2 text-sm">
            <div className="rounded-xl bg-muted/60 p-3">
              <AppIcon name="streak" size={18} />
              <p className="mt-1">{me.streak} يوم</p>
            </div>
            <div className="rounded-xl bg-muted/60 p-3">
              <AppIcon name="achievements" size={18} />
              <p className="mt-1">{me.totalXp} XP</p>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">الإنجازات</h2>
          {me.achievements.length ? (
            <ul className="grid gap-3 sm:grid-cols-2">
              {me.achievements.map((a, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-muted/60 p-3">
                  <AppIcon name="achievements" tile size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.achievements?.title_ar}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {a.achievements?.description_ar}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="achievements"
              title="لا إنجازات بعد"
              body="أكمل جلسة تدريب كاملة لتحصل على أول إنجاز."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

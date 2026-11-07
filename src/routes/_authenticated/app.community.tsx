import { createFileRoute } from "@tanstack/react-router";
import { Card, PageHeader, StatusBadge } from "@/components/common";
import { AppIcon } from "@/components/icons/AppIcon";

export const Route = createFileRoute("/_authenticated/app/community")({
  head: () => ({ meta: [{ title: "المجتمع — العصر الجديد الأول" }, { name: "description", content: "مساحات نقاش تعليمية — قريبًا." }] }),
  component: Community,
});

const spaces = [
  { icon: "physics" as const, name: "مساحة الفيزياء", body: "نقاشات ومسائل محلولة." },
  { icon: "chemistry" as const, name: "مساحة الكيمياء", body: "تفاعلات ومعادلات وأسئلة." },
  { icon: "assistant" as const, name: "سؤال وجواب", body: "اسأل زملاءك ومعلمين معتمدين." },
];

function Community() {
  return (
    <div>
      <PageHeader title="المجتمع" subtitle="لن يُفعّل النشر قبل وضع أدوات الإشراف والإبلاغ وحماية الخصوصية." icon="community" actions={<StatusBadge tone="soon" />} />
      <div className="grid gap-4 sm:grid-cols-3">
        {spaces.map((s) => (
          <Card key={s.name} className="opacity-80">
            <AppIcon name={s.icon} tile size={48} />
            <h2 className="mt-3 font-semibold">{s.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
            <StatusBadge tone="soon" className="mt-3" />
          </Card>
        ))}
      </div>
      <Card className="mt-6 text-sm text-muted-foreground">
        لا توجد منشورات بعد. لا نعرض أي نشاط وهمي — عند الإطلاق ستظهر هنا مشاركات حقيقية فقط.
      </Card>
    </div>
  );
}

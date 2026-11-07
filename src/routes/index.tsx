import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="relative grid min-h-screen place-items-center px-4">
      <div className="ambient" aria-hidden />
      <main className="relative z-10 w-full max-w-xl space-y-8 text-center">
        <Logo className="justify-center" />
        <div className="space-y-3">
          <h1 className="font-display text-3xl font-bold leading-snug sm:text-4xl">
            تعلّم الفيزياء والكيمياء <span className="text-gradient">بطريقة تفاعلية</span>
          </h1>
          <p className="text-muted-foreground">
            منصة لطلاب الثانوية العامة في مصر: دروس مبسطة ورسوم تفاعلية وتدريب يتكيف مع مستواك ومسابقات بين الطلاب.
          </p>
        </div>
        <Link to="/auth" className="press inline-block rounded-xl bg-brand px-8 py-3 font-medium text-primary-foreground">
          ابدأ الآن
        </Link>
      </main>
    </div>
  );
}

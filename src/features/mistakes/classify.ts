export type Cause = { kind: "معامل" | "وحدات" | "تربيع" | "حساب" | "وقت" | "مفهوم"; text: string };

const parse = (label: string) => {
  const m = label.match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

/**
 * يصنّف سبب الخطأ من العلاقة بين الإجابة المختارة والصحيحة.
 * أخطاء الاختيارات الرقمية لها أنماط معروفة: ضعف أو نصف، عشرة أضعاف، مربع أو جذر، خطوة حسابية ناقصة.
 */
export function classifyMistake(correctLabel: string, chosenLabel: string | null): Cause {
  if (!chosenLabel)
    return {
      kind: "وقت",
      text: "انتهى الوقت قبل أن تجيب. أعد حل السؤال بهدوء ثم تدرّب على السرعة.",
    };
  const a = parse(correctLabel);
  const b = parse(chosenLabel);
  if (a === null || b === null || a === 0)
    return { kind: "مفهوم", text: "راجع شرح الدرس والقانون ثم أعد المحاولة." };
  const r = b / a;
  const near = (x: number) => Math.abs(r - x) / x < 0.03;
  if (near(2) || near(0.5))
    return {
      kind: "معامل",
      text: "الناتج ضعف الصحيح أو نصفه. غالبًا نسيت عددًا ثابتًا في القانون (مثل 2 أو π) أو استخدمته مرتين.",
    };
  if (near(10) || near(0.1))
    return {
      kind: "وحدات",
      text: "الفرق عشرة أضعاف. راجع تحويل الوحدات (سم إلى متر، ملي إلى الأساسية) وموضع الفاصلة.",
    };
  if (near(4) || near(0.25))
    return { kind: "تربيع", text: "الفرق أربعة أضعاف. راجع هل يحتوي القانون مربعًا أو جذرًا." };
  if (near(1.5) || near(0.75) || Math.abs(b - a) === 1)
    return {
      kind: "حساب",
      text: "خطوة حسابية وسيطة غير مكتملة. أعد الحل خطوة خطوة وراجع الجمع والقسمة.",
    };
  return {
    kind: "مفهوم",
    text: "الإجابة بعيدة عن الصحيحة بلا نمط واضح. ابدأ من القانون وحدّد المعطيات والمطلوب.",
  };
}

# العصر الجديد الأول

منصة تعليمية لطلاب الثانوية العامة في مصر (فيزياء وكيمياء): دروس، تدريب، مسابقات ومساعد ذكي اختياري.

## التشغيل

1. ثبّت Node.js (الإصدار 20 أو أحدث).
2. في ملف `.env` ضع `SUPABASE_SERVICE_ROLE_KEY` (من Supabase > Project Settings > API Keys > Secret key).
3. في Supabase > SQL Editor الصق محتوى `supabase/schema.sql` ثم Run مرة واحدة.
4. في الطرفية داخل المجلد:

```
npm install
npm run dev
```

ثم افتح http://localhost:3000

## ملاحظات

- لتجربة التسجيل بسهولة: Supabase > Authentication > Sign In / Providers > Email، وأوقف Confirm email أثناء التجربة فقط.
- المساعد الذكي لا يعمل إلا بعد وضع `ANTHROPIC_API_KEY` في `.env`.
- لا ترفع ملف `.env` إلى GitHub.

## هيكل المشروع

- `src/routes`: الصفحات
- `src/features`: منطق الدروس والتدريب
- `src/lib/ai`: المساعد الذكي (السيرفر فقط)
- `src/integrations/supabase`: الاتصال بقاعدة البيانات
- `supabase/schema.sql`: الجداول وسياسات الأمان وبيانات تجريبية

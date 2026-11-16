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
- المساعد الذكي لا يعمل إلا بعد وضع `GEMINI_API_KEY` في `.env`.
- لا ترفع ملف `.env` إلى GitHub.

## هيكل المشروع

- `src/routes`: الصفحات
- `src/features`: منطق الدروس والتدريب
- `src/lib/ai`: المساعد الذكي (السيرفر فقط)
- `src/integrations/supabase`: الاتصال بقاعدة البيانات
- `supabase/schema.sql`: الجداول وسياسات الأمان وبيانات تجريبية


## Gemini-only AI setup and persistent data

1. In Google AI Studio, revoke the previously exposed Gemini API key and create a replacement. Never commit the replacement key.
2. In Vercel Project Settings → Environment Variables, set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` (default: `gemini-2.5-flash`). Remove `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` if they exist.
3. In the Supabase SQL Editor, run `supabase/ai-persistence.sql` once. This creates user-owned tables for tutor conversations/messages and generated exams/results with Row Level Security.
4. Deploy the updated project. Existing accounts and unrelated tables are not changed by this migration.

Claude/Anthropic code and its SDK dependency have been removed. AI chat history and generated exams are stored per authenticated Supabase user.

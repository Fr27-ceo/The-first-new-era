import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const isNewKey = (value: string) =>
  value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");

// المفاتيح الجديدة ليست JWT، فلا نرسلها في ترويسة Authorization
function createSupabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`)
      headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseClient() {
  const url =
    import.meta.env["VITE_SUPABASE_URL"] ||
    process.env["SUPABASE_URL"] ||
    "https://mock.supabase.co";
  const key =
    import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
    process.env["SUPABASE_PUBLISHABLE_KEY"] ||
    "sb_publishable_mock_key";

  if (!import.meta.env["VITE_SUPABASE_URL"] && !process.env["SUPABASE_URL"]) {
    console.warn(
      "[Supabase] لم يتم ضبط SUPABASE_URL أو SUPABASE_PUBLISHABLE_KEY — يعمل التطبيق ببيانات تجريبية محلية (انظر .env.example).",
    );
  }

  return createClient<Database>(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: { persistSession: true, autoRefreshToken: true },
  });
}

let instance: ReturnType<typeof createSupabaseClient> | undefined;

// الاستخدام: import { supabase } from "@/integrations/supabase/client"
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!instance) instance = createSupabaseClient();
    return Reflect.get(instance, prop, receiver);
  },
});

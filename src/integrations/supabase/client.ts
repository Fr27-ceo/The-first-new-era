import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const isNewKey = (value: string) => value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");

// المفاتيح الجديدة ليست JWT، فلا نرسلها في ترويسة Authorization
function createSupabaseFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
    if (init?.headers) new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseClient() {
  const url = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!url || !key) {
    const message = "ملف .env ينقصه SUPABASE_URL أو SUPABASE_PUBLISHABLE_KEY (انسخهما من ملف .env.example)";
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
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

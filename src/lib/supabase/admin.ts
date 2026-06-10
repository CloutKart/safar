import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, hasSupabase } from "@/lib/env";

let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!hasSupabase) {
    throw new Error("Supabase service credentials are not configured");
  }

  if (!client) {
    client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      },
    );
  }

  return client;
}

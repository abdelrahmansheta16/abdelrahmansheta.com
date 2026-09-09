/** Route-side Supabase accessor. Returns null instead of throwing so a route can decide whether a
 *  missing database means "degrade" (text chat) or "refuse" (voice mint, e-mail). */
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/db/client";

export function dbOrNull(): SupabaseClient | null {
  try {
    return db();
  } catch {
    return null;
  }
}

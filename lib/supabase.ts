import { createClient } from "@supabase/supabase-js";

// The URL and publishable key are meant to ship to the browser - what
// protects the data is row level security on the tables (see the
// hc_profiles / hc_friendships policies), not hiding these two values.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const authConfigured = Boolean(url && key);

export const supabase = createClient(
  url ?? "http://localhost:54321",
  key ?? "missing-key"
);

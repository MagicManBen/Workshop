// Supabase client, configured to talk to the `workshop` schema by default.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.WORKSHOP_CONFIG;

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
  db: { schema: cfg.SCHEMA },
  auth: { persistSession: true, autoRefreshToken: true },
});

export const CONFIG = cfg;

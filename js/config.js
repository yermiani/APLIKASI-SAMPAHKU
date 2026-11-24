import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const SUPABASE_URL = "https://uxrzdljibyjvwtdifdun.supabase.co";
export const SUPABASE_KEY = "sb_publishable_xzFmIxkomuCRYy9RaA1Jyg_D0I0sWXZ";

export const STORAGE_BUCKET_BUKTI = "bukti-sampah";

export const ROLES = {
  WARGA: "warga",
  PETUGAS: "petugas",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

import { supabase, ROLES } from "./config.js";

export function normalisasiPeran(peranRaw) {
  const p = String(peranRaw || ROLES.WARGA)
    .trim()
    .toLowerCase();
  if (p === "super_admin") return ROLES.SUPER_ADMIN;
  if (p === "admin") return ROLES.ADMIN;
  if (p === "petugas") return ROLES.PETUGAS;
  return ROLES.WARGA;
}

export function getRedirectPathByRole(peranRaw, fromSubfolder = false) {
  const peran = normalisasiPeran(peranRaw);
  const prefix = fromSubfolder ? "../" : "";

  if (peran === ROLES.SUPER_ADMIN || peran === ROLES.ADMIN) {
    return `${prefix}dashboard_admin/dashboard.html`;
  }
  if (peran === ROLES.PETUGAS) {
    return `${prefix}dashboard_admin/petugas.html`;
  }
  return `${prefix}dashboard_warga/dashboard.html`;
}

export async function getCurrentUserAndProfile() {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError || !sessionData?.session?.user) {
    return { user: null, profil: null, peran: null };
  }

  const user = sessionData.session.user;
  const { data: profil } = await supabase
    .from("profil")
    .select("id, nama_lengkap, peran, wilayah_tugas, no_hp")
    .eq("id", user.id)
    .maybeSingle();

  const peran = normalisasiPeran(profil?.peran || user.user_metadata?.peran);

  return {
    user,
    profil: profil || {
      id: user.id,
      nama_lengkap:
        user.user_metadata?.nama_lengkap ||
        user.email?.split("@")[0] ||
        "Pengguna",
      peran,
      wilayah_tugas: user.user_metadata?.wilayah_tugas || null,
      no_hp: user.user_metadata?.no_hp || null,
    },
    peran,
  };
}

export async function requireAuth({
  allowedRoles = [],
  fromSubfolder = false,
} = {}) {
  const authInfo = await getCurrentUserAndProfile();
  const loginUrl = fromSubfolder ? "../login.html" : "login.html";

  if (!authInfo.user) {
    window.location.href = loginUrl;
    return null;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(authInfo.peran)) {
    window.location.href = getRedirectPathByRole(authInfo.peran, fromSubfolder);
    return null;
  }

  return authInfo;
}

export async function loginWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });

  if (error) {
    return { ok: false, message: error.message, peran: null };
  }

  const uid = data?.user?.id;
  const { data: profil } = await supabase
    .from("profil")
    .select("peran, nama_lengkap")
    .eq("id", uid)
    .maybeSingle();

  const peran = normalisasiPeran(
    profil?.peran || data?.user?.user_metadata?.peran,
  );

  return {
    ok: true,
    user: data.user,
    profil,
    peran,
  };
}

export async function registerWarga({ nama_lengkap, no_hp, email, password }) {
  const cleanNama = String(nama_lengkap || "").trim();
  const cleanHp = String(no_hp || "").trim();
  const cleanEmail = String(email || "").trim();

  const { data, error } = await supabase.auth.signUp({
    email: cleanEmail,
    password,
    options: {
      data: {
        nama_lengkap: cleanNama,
        no_hp: cleanHp,
        peran: ROLES.WARGA,
      },
    },
  });

  if (error) {
    return { ok: false, message: error.message, hasSession: false };
  }

  if (data?.user?.id && data?.session) {
    await supabase.from("profil").upsert(
      {
        id: data.user.id,
        nama_lengkap: cleanNama,
        no_hp: cleanHp || null,
        peran: ROLES.WARGA,
      },
      { onConflict: "id" },
    );
  }

  return {
    ok: true,
    hasSession: Boolean(data?.session),
    user: data?.user || null,
  };
}

export async function logoutUser(fromSubfolder = false) {
  await supabase.auth.signOut();
  window.location.href = fromSubfolder ? "../login.html" : "login.html";
}

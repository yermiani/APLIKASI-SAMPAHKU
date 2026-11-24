import { supabase, STORAGE_BUCKET_BUKTI, ROLES } from "./config.js";
import { requireAuth, logoutUser } from "./auth.js";

let activeUser = null;
let activeProfil = null;
let listWilayah = [];
let listKategori = [];
let daftarLaporanSaya = [];
let tiketTerakhirDibuat = "";
let selectedTarif = 3500;
let selectedSatuan = "kg";

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badgeStatusHtml(status) {
  if (status === "Selesai") {
    return '<span class="px-2.5 py-0.5 rounded-full bg-emerald-100 text-brandGreen text-[10px] font-extrabold">Selesai</span>';
  }
  if (status === "Diproses") {
    return '<span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-brandOrangeDark text-[10px] font-extrabold">Diproses</span>';
  }
  return '<span class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">Pending</span>';
}

function formatTanggal(isoStr) {
  if (!isoStr) return "-";
  const d = new Date(isoStr);
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function showBanner(msg, type = "error") {
  const el = document.getElementById("warga-alert");
  if (!el) return;
  el.textContent = msg;
  el.className =
    "p-3 rounded-2xl text-xs font-semibold leading-relaxed " +
    (type === "success"
      ? "bg-emerald-50 text-brandGreenDark border border-emerald-200"
      : "bg-rose-50 text-rose-700 border border-rose-200");
}

function clearBanner() {
  const el = document.getElementById("warga-alert");
  if (!el) return;
  el.className = "hidden";
  el.textContent = "";
}

export function switchTab(tabName) {
  document
    .querySelectorAll(".tab-view")
    .forEach((sec) => sec.classList.add("hidden"));
  document.getElementById(`tab-${tabName}`)?.classList.remove("hidden");

  document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    const aktif = btn.dataset.nav === tabName;
    btn.classList.toggle("text-brandGreen", aktif);
    btn.classList.toggle("text-slate-400", !aktif);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function muatMasterData() {
  const [{ data: wilayahData }, { data: kategoriData }] = await Promise.all([
    supabase
      .from("wilayah")
      .select("id, nama_wilayah, kecamatan")
      .eq("aktif", true)
      .order("nama_wilayah", { ascending: true }),
    supabase
      .from("kategori_sampah")
      .select(
        "id, nama_kategori, jenis_limbah, estimasi_tarif_per_kg, satuan, panduan_pemilahan",
      )
      .eq("aktif", true)
      .order("id", { ascending: true }),
  ]);

  listWilayah = wilayahData || [];
  listKategori = kategoriData || [];

  const wilayahSelect = document.getElementById("wilayahSelect");
  if (wilayahSelect && listWilayah.length > 0) {
    wilayahSelect.innerHTML = listWilayah
      .map(
        (w) => `<option value="${w.id}">${escapeHtml(w.nama_wilayah)}</option>`,
      )
      .join("");
  }

  const kategoriSelect = document.getElementById("kategoriLaporan");
  if (kategoriSelect && listKategori.length > 0) {
    kategoriSelect.innerHTML =
      `<option value="" disabled selected>Pilih Kategori Sampah</option>` +
      listKategori
        .map(
          (k) =>
            `<option value="${k.id}">${escapeHtml(k.nama_kategori)} — Rp ${Number(k.estimasi_tarif_per_kg).toLocaleString("id-ID")} / ${escapeHtml(k.satuan || "kg")}</option>`,
        )
        .join("");
  }

  const edukasiContainer = document.getElementById("edukasiCardsContainer");
  if (edukasiContainer && listKategori.length > 0) {
    edukasiContainer.innerHTML = listKategori
      .map(
        (k, idx) => `
        <div class="min-w-[220px] bg-white p-3.5 rounded-2xl border border-emerald-100 shadow-sm space-y-1.5">
          <div class="flex items-center justify-between gap-1">
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 text-brandGreen text-[10px] font-bold">${escapeHtml(k.jenis_limbah)}</span>
            ${
              k.estimasi_tarif_per_kg > 0
                ? `<span class="text-[10px] font-extrabold text-brandOrangeDark">Rp ${Number(k.estimasi_tarif_per_kg).toLocaleString("id-ID")} / ${escapeHtml(k.satuan || "kg")}</span>`
                : ""
            }
          </div>
          <p class="text-xs font-extrabold text-brandCharcoal">${idx + 1}. ${escapeHtml(k.nama_kategori)}</p>
          <p class="text-[11px] text-slate-500 leading-relaxed">
            ${escapeHtml(k.panduan_pemilahan || "Pisahkan sampah sesuai jenisnya agar mudah diangkut petugas.")}
          </p>
        </div>`,
      )
      .join("");
  }

  const katBernilai = listKategori.filter((k) => k.estimasi_tarif_per_kg > 0);
  const calcButtons = document.getElementById("calcCategoryButtons");
  if (calcButtons && katBernilai.length > 0) {
    calcButtons.className = "grid grid-cols-2 gap-2";
    selectedTarif = katBernilai[0].estimasi_tarif_per_kg;
    selectedSatuan = katBernilai[0].satuan || "kg";

    calcButtons.innerHTML = katBernilai
      .map(
        (k, idx) => `
        <button
          type="button"
          data-tarif="${k.estimasi_tarif_per_kg}"
          data-satuan="${escapeHtml(k.satuan || "kg")}"
          class="m-cat-btn p-2.5 rounded-xl text-left transition ${
            idx === 0
              ? "border-2 border-brandGreen bg-emerald-50/60"
              : "border border-slate-200 bg-white"
          }"
        >
          <p class="text-[11px] font-extrabold text-brandCharcoal truncate">${escapeHtml(k.nama_kategori)}</p>
          <p class="text-[10px] font-semibold text-brandOrangeDark mt-0.5">Rp ${Number(k.estimasi_tarif_per_kg).toLocaleString("id-ID")} / ${escapeHtml(k.satuan || "kg")}</p>
        </button>`,
      )
      .join("");

    calcButtons.querySelectorAll(".m-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedTarif = Number(btn.dataset.tarif || 0);
        selectedSatuan = btn.dataset.satuan || "kg";
        calcButtons.querySelectorAll(".m-cat-btn").forEach((b) => {
          b.classList.remove(
            "border-2",
            "border-brandGreen",
            "bg-emerald-50/60",
          );
          b.classList.add("border", "border-slate-200", "bg-white");
        });
        btn.classList.remove("border", "border-slate-200", "bg-white");
        btn.classList.add("border-2", "border-brandGreen", "bg-emerald-50/60");
        updateMobileCalc();
      });
    });

    updateMobileCalc();
  }
}

export function updateMobileCalc() {
  const jumlah = Number(
    document.getElementById("mobileWeightRange")?.value || 5,
  );
  const badge = document.getElementById("mobileWeightBadge");
  const res = document.getElementById("mobileEstResult");
  const labelSatuan = selectedSatuan.toLowerCase() === "liter" ? "Liter" : "Kg";

  if (badge) badge.textContent = `${jumlah} ${labelSatuan}`;
  if (res) {
    res.textContent = `Rp ${(jumlah * selectedTarif).toLocaleString("id-ID")}`;
  }
}

async function muatLaporanSaya() {
  if (!activeUser) return;

  const { data, error } = await supabase
    .from("laporan_sampah")
    .select("*")
    .eq("pelapor_id", activeUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat laporan warga:", error.message);
    return;
  }

  daftarLaporanSaya = data || [];
  renderStatistikSaya();
  renderDaftarTiketSaya();
}

function renderStatistikSaya() {
  const totalEl = document.getElementById("statTotal");
  const prosesEl = document.getElementById("statProses");
  const selesaiEl = document.getElementById("statSelesai");

  if (totalEl) totalEl.textContent = daftarLaporanSaya.length;
  if (prosesEl) {
    prosesEl.textContent = daftarLaporanSaya.filter(
      (i) => i.status === "Diproses",
    ).length;
  }
  if (selesaiEl) {
    selesaiEl.textContent = daftarLaporanSaya.filter(
      (i) => i.status === "Selesai",
    ).length;
  }
}

function renderDaftarTiketSaya() {
  const container = document.getElementById("daftarTiketList");
  if (!container) return;

  if (daftarLaporanSaya.length === 0) {
    container.innerHTML = `
      <div class="bg-white p-4 rounded-2xl border border-slate-200/80 text-center space-y-2">
        <p class="text-xs font-bold text-slate-600">Belum ada laporan sampah yang dikirim.</p>
        <button type="button" id="btn-empty-lapor" class="px-4 py-2 rounded-xl bg-brandGreen text-white text-xs font-bold">
          Buat Laporan Pertama
        </button>
      </div>`;
    document
      .getElementById("btn-empty-lapor")
      ?.addEventListener("click", () => switchTab("lapor"));
    return;
  }

  container.innerHTML = daftarLaporanSaya
    .map(
      (item) => `
      <div data-tiket="${escapeHtml(item.nomor_tiket)}" class="tiket-card-item bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm cursor-pointer active:scale-[0.99] transition">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xs font-extrabold text-brandGreen">${escapeHtml(item.nomor_tiket)}</span>
          ${badgeStatusHtml(item.status)}
        </div>
        <p class="text-xs font-bold text-brandCharcoal">${escapeHtml(item.kategori_nama)} &bull; ${escapeHtml(item.wilayah_nama)}</p>
        <p class="text-[11px] text-slate-500 truncate mt-0.5">${escapeHtml(item.alamat_lokasi)}</p>
        <p class="text-[10px] text-slate-400 mt-1">${formatTanggal(item.created_at)}</p>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".tiket-card-item").forEach((card) => {
    card.addEventListener("click", () => {
      const kode = card.dataset.tiket;
      const field = document.getElementById("searchTicketField");
      if (field) field.value = kode;
      cariTiketByKode(kode);
    });
  });
}

export async function cariTiketByKode(kodeRaw) {
  const kode = String(
    kodeRaw ?? document.getElementById("searchTicketField")?.value ?? "",
  )
    .trim()
    .toUpperCase();

  const box = document.getElementById("hasilCariTiket");
  if (!box) return;

  if (!kode) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `<p class="text-xs text-slate-500 py-2">Mencari tiket ${escapeHtml(kode)}...</p>`;

  const { data: laporan, error } = await supabase
    .from("laporan_sampah")
    .select("*")
    .eq("nomor_tiket", kode)
    .maybeSingle();

  if (error || !laporan) {
    box.innerHTML = `
      <div class="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
        Nomor tiket <strong>${escapeHtml(kode)}</strong> tidak ditemukan.
      </div>`;
    return;
  }

  const { data: riwayatList } = await supabase
    .from("riwayat_penanganan")
    .select("status_baru, catatan_tindakan, petugas_nama, created_at")
    .eq("laporan_id", laporan.id)
    .order("created_at", { ascending: true });

  const fotoHtml = laporan.foto_url
    ? `<img src="${escapeHtml(laporan.foto_url)}" alt="Foto bukti sampah" class="w-full h-36 object-cover rounded-xl border border-emerald-200/80 mt-2" />`
    : "";

  const riwayatHtml =
    riwayatList && riwayatList.length > 0
      ? riwayatList
          .map(
            (r) => `
            <li class="leading-relaxed">
              <strong>[${escapeHtml(r.status_baru)}]</strong> ${escapeHtml(r.catatan_tindakan)}
              <span class="block text-[10px] text-slate-400">${escapeHtml(r.petugas_nama)} &bull; ${formatTanggal(r.created_at)}</span>
            </li>`,
          )
          .join("")
      : "<li>Laporan tercatat di sistem.</li>";

  box.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 mt-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-extrabold text-brandCharcoal">${escapeHtml(laporan.nomor_tiket)}</span>
        ${badgeStatusHtml(laporan.status)}
      </div>
      <p class="text-xs text-slate-700"><strong>Pelapor:</strong> ${escapeHtml(laporan.nama_pelapor)} (${escapeHtml(laporan.wilayah_nama)})</p>
      <p class="text-xs text-slate-700"><strong>Kategori:</strong> ${escapeHtml(laporan.kategori_nama)} &bull; ${escapeHtml(laporan.jenis_layanan)}</p>
      <p class="text-xs text-slate-700"><strong>Lokasi:</strong> ${escapeHtml(laporan.alamat_lokasi)}</p>
      ${fotoHtml}
      <div class="pt-2 border-t border-emerald-200/70">
        <p class="text-[11px] font-bold text-brandGreen mb-1">Riwayat Penanganan:</p>
        <ul class="space-y-1.5 text-[11px] text-slate-600 list-disc pl-4">
          ${riwayatHtml}
        </ul>
      </div>
    </div>`;
}

async function uploadFotoBukti(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Format foto harus JPG, PNG, atau WEBP.");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran foto maksimal 5 MB.");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const filePath = `${activeUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET_BUKTI)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("Gagal mengunggah foto bukti: " + uploadError.message);
  }

  const { data: pubData } = supabase.storage
    .from(STORAGE_BUCKET_BUKTI)
    .getPublicUrl(filePath);

  return pubData?.publicUrl || null;
}

async function handleSubmitLaporan(e) {
  e.preventDefault();
  clearBanner();

  const btnSubmit = document.getElementById("btnSubmitLaporan");
  const namaPelapor = document.getElementById("pelaporNama").value.trim();
  const noHpPelapor = document.getElementById("pelaporHp").value.trim();
  const wilayahId = Number(document.getElementById("wilayahSelect").value);
  const kategoriId = Number(document.getElementById("kategoriLaporan").value);
  const jenisLayanan = document.getElementById("jenisLayanan").value;
  const alamatLokasi = document.getElementById("alamatLokasi").value.trim();
  const catatan =
    document.getElementById("catatanLaporan")?.value.trim() || null;
  const fileInput = document.getElementById("fotoBukti");
  const file = fileInput?.files?.[0];

  if (!namaPelapor || !noHpPelapor || !kategoriId || !alamatLokasi || !file) {
    showBanner(
      "Pilih kategori sampah, lengkapi semua kolom wajib, dan unggah foto bukti.",
      "error",
    );
    return;
  }

  const wilayahObj = listWilayah.find((w) => Number(w.id) === wilayahId);
  const kategoriObj = listKategori.find((k) => Number(k.id) === kategoriId);

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Mengunggah & Membuat Tiket...";

  try {
    const fotoUrl = await uploadFotoBukti(file);

    const { data: inserted, error: insertError } = await supabase
      .from("laporan_sampah")
      .insert({
        nomor_tiket: "",
        pelapor_id: activeUser.id,
        nama_pelapor: namaPelapor,
        no_hp_pelapor: noHpPelapor,
        wilayah_id: wilayahObj ? wilayahObj.id : null,
        wilayah_nama: wilayahObj ? wilayahObj.nama_wilayah : "Umum",
        kategori_id: kategoriObj ? kategoriObj.id : null,
        kategori_nama: kategoriObj ? kategoriObj.nama_kategori : "Umum",
        jenis_layanan: jenisLayanan,
        alamat_lokasi: alamatLokasi,
        catatan,
        foto_url: fotoUrl,
        status: "Pending",
      })
      .select("nomor_tiket")
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    tiketTerakhirDibuat = inserted?.nomor_tiket || "-";

    document.getElementById("laporanForm").reset();
    isiDataProfilKeForm();
    document.getElementById("fotoPreview")?.classList.add("hidden");
    const lbl = document.getElementById("fotoLabel");
    if (lbl) lbl.textContent = "Ketuk untuk ambil atau pilih foto bukti";

    await muatLaporanSaya();

    const codeEl = document.getElementById("generatedTicketCode");
    if (codeEl) codeEl.textContent = tiketTerakhirDibuat;

    const modal = document.getElementById("ticketSuccessModal");
    modal?.classList.remove("hidden");
    modal?.classList.add("flex");
  } catch (err) {
    showBanner(
      err.message || "Terjadi kesalahan saat mengirim laporan.",
      "error",
    );
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Kirim Laporan & Buat Tiket";
  }
}

function isiDataProfilKeForm() {
  const namaInput = document.getElementById("pelaporNama");
  const hpInput = document.getElementById("pelaporHp");
  if (namaInput && activeProfil?.nama_lengkap) {
    namaInput.value = activeProfil.nama_lengkap;
  }
  if (hpInput && activeProfil?.no_hp) {
    hpInput.value = activeProfil.no_hp;
  }
}

export async function initDashboardWarga() {
  const authInfo = await requireAuth({
    allowedRoles: [ROLES.WARGA],
    fromSubfolder: true,
  });
  if (!authInfo) return;

  activeUser = authInfo.user;
  activeProfil = authInfo.profil;

  const namaHeader = document.getElementById("headerUserName");
  if (namaHeader) {
    namaHeader.textContent = activeProfil?.nama_lengkap || "Warga SampahKu";
  }

  isiDataProfilKeForm();
  await Promise.all([muatMasterData(), muatLaporanSaya()]);

  document
    .getElementById("btnLogoutWarga")
    ?.addEventListener("click", () => logoutUser(true));

  document
    .getElementById("laporanForm")
    ?.addEventListener("submit", handleSubmitLaporan);

  document
    .getElementById("mobileWeightRange")
    ?.addEventListener("input", updateMobileCalc);

  document
    .getElementById("headerTrackForm")
    ?.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("headerTicketInput")?.value.trim();
      switchTab("tiket");
      if (val) {
        const field = document.getElementById("searchTicketField");
        if (field) field.value = val;
        cariTiketByKode(val);
      }
    });

  document
    .getElementById("btnCariTiket")
    ?.addEventListener("click", () => cariTiketByKode());

  document
    .getElementById("btnCloseTicketModal")
    ?.addEventListener("click", () => {
      const modal = document.getElementById("ticketSuccessModal");
      modal?.classList.add("hidden");
      modal?.classList.remove("flex");
      switchTab("tiket");
      if (tiketTerakhirDibuat) {
        const field = document.getElementById("searchTicketField");
        if (field) field.value = tiketTerakhirDibuat;
        cariTiketByKode(tiketTerakhirDibuat);
      }
    });

  document.getElementById("fotoBukti")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    const preview = document.getElementById("fotoPreview");
    const label = document.getElementById("fotoLabel");
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran foto maksimal 5 MB.");
      event.target.value = "";
      return;
    }

    if (label) label.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (preview) {
        preview.src = ev.target.result;
        preview.classList.remove("hidden");
      }
    };
    reader.readAsDataURL(file);
  });

  document.querySelectorAll("[data-go-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goTab));
  });

  document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.nav));
  });
}

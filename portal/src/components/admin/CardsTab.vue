<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet, apiPost } from "../../api/client";
import type { AdminPackage, AdminCard, CardBatch } from "../../api/adminTypes";
import { t } from "../../i18n";
import { copyText } from "../../utils/format";

const packages = ref<AdminPackage[]>([]);
const cards = ref<AdminCard[]>([]);
const batches = ref<CardBatch[]>([]);
const loading = ref(true);

const filterPkg = ref<number>(0);
const filterStatus = ref<string>("");
const filterBatch = ref<string>("");

const genPkg = ref<number>(0);
const genCount = ref<number>(10);
const genBatch = ref<string>("");
const genBusy = ref(false);
const genError = ref("");
const generated = ref<AdminCard[]>([]);
const copied = ref(false);

async function loadPackages() {
  const res = await apiGet<{ packages: AdminPackage[] }>("/admin/packages", { admin: true });
  packages.value = res.packages;
  if (!genPkg.value && res.packages[0]) genPkg.value = res.packages[0].id;
}
async function loadCards() {
  loading.value = true;
  try {
    const q = new URLSearchParams();
    if (filterPkg.value) q.set("packageId", String(filterPkg.value));
    if (filterStatus.value) q.set("status", filterStatus.value);
    if (filterBatch.value) q.set("batchNo", filterBatch.value);
    const res = await apiGet<{ cards: AdminCard[] }>(`/admin/cards?${q.toString()}`, { admin: true });
    cards.value = res.cards;
  } finally {
    loading.value = false;
  }
}
async function loadBatches() {
  const res = await apiGet<{ batches: CardBatch[] }>("/admin/cards/batches", { admin: true });
  batches.value = res.batches;
}

async function generate() {
  genError.value = "";
  if (!genPkg.value) { genError.value = t("admin_cards_need_pkg"); return; }
  genBusy.value = true;
  try {
    const res = await apiPost<{ cards: AdminCard[] }>(
      "/admin/cards/generate",
      { packageId: genPkg.value, count: Number(genCount.value), batchNo: genBatch.value || undefined },
      { admin: true }
    );
    generated.value = res.cards || [];
    await Promise.all([loadCards(), loadBatches()]);
  } catch (e) {
    genError.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    genBusy.value = false;
  }
}

function codes(list: AdminCard[]): string {
  return list.map((c) => c.code).join("\n");
}
async function copyGenerated() {
  const ok = await copyText(codes(generated.value));
  if (ok) { copied.value = true; setTimeout(() => (copied.value = false), 1500); }
}
function downloadCsv(list: AdminCard[], filename: string) {
  const header = ["code", "package", "batch", "status"];
  const rows = list.map((c) => [c.code, c.package?.name || c.packageId, c.batchNo, c.status]);
  const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

async function setStatus(c: AdminCard, status: "unused" | "disabled") {
  await apiPost(`/admin/cards/${c.id}/status`, { status }, { admin: true });
  await loadCards();
  await loadBatches();
}
async function setBatchStatus(b: CardBatch, status: "unused" | "disabled") {
  const key = status === "disabled" ? "admin_cards_batch_disable_confirm" : "admin_cards_batch_enable_confirm";
  if (!confirm(t(key, { batch: b.batchNo }))) return;
  await apiPost(`/admin/cards/batches/${encodeURIComponent(b.batchNo)}/status`, { status }, { admin: true });
  await Promise.all([loadCards(), loadBatches()]);
}
function filterByBatch(b: CardBatch) {
  filterBatch.value = filterBatch.value === b.batchNo ? "" : b.batchNo;
  loadCards();
}
async function exportBatch(b: CardBatch) {
  const q = new URLSearchParams({ batchNo: b.batchNo, status: "unused" });
  const res = await apiGet<{ cards: AdminCard[] }>(`/admin/cards?${q.toString()}`, { admin: true });
  if (res.cards.length === 0) { alert(t("admin_cards_b_empty")); return; }
  downloadCsv(res.cards, `cards-${b.batchNo}-unused.csv`);
}
function statusLabel(s: string): string {
  return s === "unused" ? t("admin_cards_status_unused") : s === "used" ? t("admin_cards_status_used") : t("admin_cards_status_disabled");
}
function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleDateString() : "-";
}

onMounted(async () => {
  await loadPackages();
  await Promise.all([loadCards(), loadBatches()]);
});
</script>

<template>
  <div class="panel wide">
    <!-- generate -->
    <div class="gen-box">
      <div class="gen-row">
        <label>{{ t("admin_cards_pkg") }}
          <select v-model="genPkg">
            <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <label>{{ t("admin_cards_count") }}
          <input v-model.number="genCount" type="number" min="1" max="10000" style="width:90px" />
        </label>
        <label>{{ t("admin_cards_batch") }}
          <input v-model="genBatch" placeholder="B2026..." style="width:140px" />
        </label>
        <button class="btn" :disabled="genBusy" @click="generate">{{ t("admin_cards_gen") }}</button>
      </div>
      <div v-if="genError" class="alert err">{{ genError }}</div>
      <div v-if="generated.length" class="gen-result">
        <div class="gen-result-head">
          <strong>{{ t("admin_cards_generated") }}：{{ generated.length }}</strong>
          <span style="display:flex;gap:8px">
            <button class="btn sm ghost" @click="copyGenerated">{{ copied ? t("copied") : t("admin_copy_all") }}</button>
            <button class="btn sm ghost" @click="downloadCsv(generated, 'cards-new.csv')">{{ t("admin_export_csv") }}</button>
          </span>
        </div>
        <textarea class="code" rows="5" :value="codes(generated)" readonly></textarea>
      </div>
    </div>

    <!-- batches -->
    <h3 style="margin:18px 0 8px">{{ t("admin_cards_batches") }}</h3>
    <div v-if="batches.length === 0" class="muted" style="padding:8px 0">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_col_batch") }}</th><th>{{ t("admin_col_pkg") }}</th>
          <th>{{ t("admin_cards_b_unused") }}</th><th>{{ t("admin_cards_b_used") }}</th>
          <th>{{ t("admin_cards_b_disabled") }}</th><th>{{ t("admin_col_time") }}</th>
          <th>{{ t("admin_cards_b_expire") }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="b in batches" :key="b.batchNo" :class="{ sel: filterBatch === b.batchNo }">
          <td style="font-family:monospace">{{ b.batchNo }}</td>
          <td>{{ b.packageName }}</td>
          <td><strong :class="b.unused === 0 ? 'muted' : ''">{{ b.unused }}</strong> / {{ b.total }}</td>
          <td>{{ b.used }}</td>
          <td>{{ b.disabled }}</td>
          <td>{{ fmt(b.createdAt) }}</td>
          <td>{{ fmt(b.expiresAt) }}</td>
          <td>
            <span style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn sm ghost" @click="filterByBatch(b)">{{ filterBatch === b.batchNo ? t("admin_cards_b_clearfilter") : t("admin_cards_b_filter") }}</button>
              <button class="btn sm ghost" @click="exportBatch(b)">{{ t("admin_cards_b_export") }}</button>
              <button v-if="b.unused > 0" class="btn sm ghost" style="color:var(--warn)" @click="setBatchStatus(b, 'disabled')">{{ t("admin_cards_disable") }}</button>
              <button v-else-if="b.disabled > 0 && b.unused === 0" class="btn sm ghost" @click="setBatchStatus(b, 'unused')">{{ t("admin_cards_enable") }}</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- filters -->
    <div class="gen-row" style="margin:14px 0">
      <label>{{ t("admin_cards_pkg") }}
        <select v-model="filterPkg" @change="loadCards">
          <option :value="0">{{ t("admin_filter_all") }}</option>
          <option v-for="p in packages" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label>{{ t("admin_col_status") }}
        <select v-model="filterStatus" @change="loadCards">
          <option value="">{{ t("admin_filter_all") }}</option>
          <option value="unused">{{ t("admin_cards_status_unused") }}</option>
          <option value="used">{{ t("admin_cards_status_used") }}</option>
          <option value="disabled">{{ t("admin_cards_status_disabled") }}</option>
        </select>
      </label>
      <button class="btn sm ghost" @click="downloadCsv(cards, 'cards-list.csv')">{{ t("admin_export_csv") }}</button>
      <span v-if="filterBatch" class="badge exp" style="cursor:pointer" @click="filterByBatch({ batchNo: filterBatch } as CardBatch)">
        {{ t("admin_cards_b_filter") }}: {{ filterBatch }} ✕
      </span>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="cards.length === 0" class="muted center" style="padding:20px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_col_code") }}</th><th>{{ t("admin_col_pkg") }}</th>
          <th>{{ t("admin_col_batch") }}</th><th>{{ t("admin_col_status") }}</th>
          <th>{{ t("admin_col_usedby") }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in cards" :key="c.id">
          <td style="font-family:monospace">{{ c.code }}</td>
          <td>{{ c.package?.name || c.packageId }}</td>
          <td>{{ c.batchNo }}</td>
          <td>
            <span class="badge" :class="c.status === 'unused' ? 'run' : c.status === 'used' ? 'stop' : 'exp'">
              {{ statusLabel(c.status) }}
            </span>
          </td>
          <td>{{ c.usedBy || "-" }}<div class="muted" style="font-size:11px">{{ fmt(c.usedAt) }}</div></td>
          <td>
            <button v-if="c.status === 'unused'" class="btn sm ghost" style="color:var(--warn)" @click="setStatus(c, 'disabled')">{{ t("admin_cards_disable") }}</button>
            <button v-else-if="c.status === 'disabled'" class="btn sm ghost" @click="setStatus(c, 'unused')">{{ t("admin_cards_enable") }}</button>
            <span v-else class="muted">-</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

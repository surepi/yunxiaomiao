<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminOrder } from "../../api/adminTypes";
import { t } from "../../i18n";
import { priceYuan } from "../../utils/format";

const orders = ref<AdminOrder[]>([]);
const loading = ref(true);

const q = ref("");
const status = ref("");
const from = ref("");
const to = ref("");

const statusOptions = ["provisioning", "done", "failed"];
function statusLabel(st: string): string {
  if (st === "done") return t("st_done");
  if (st === "provisioning") return t("st_provisioning");
  if (st === "failed") return t("st_failed");
  return st;
}
function statusBadge(st: string): string {
  if (st === "done") return "run";
  if (st === "failed") return "exp";
  return "warn";
}
function sourceLabel(src: string): string {
  if (src === "card") return t("src_card");
  if (src === "webhook") return t("src_webhook");
  return src;
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (status.value) params.set("status", status.value);
    if (from.value) params.set("from", from.value);
    if (to.value) params.set("to", to.value);
    const res = await apiGet<{ orders: AdminOrder[] }>(`/admin/orders?${params.toString()}`, { admin: true });
    orders.value = res.orders;
  } finally {
    loading.value = false;
  }
}

function reset() {
  q.value = "";
  status.value = "";
  from.value = "";
  to.value = "";
  load();
}

onMounted(load);
function fmt(ts: string): string {
  return ts ? new Date(ts).toLocaleString() : "-";
}
</script>

<template>
  <div class="panel wide">
    <div class="filter-bar">
      <input v-model="q" :placeholder="t('admin_filter_q_orders')" class="filter-q" @keyup.enter="load" />
      <select v-model="status">
        <option value="">{{ t("admin_filter_all") }}</option>
        <option v-for="st in statusOptions" :key="st" :value="st">{{ statusLabel(st) }}</option>
      </select>
      <label class="filter-date">{{ t("admin_filter_from") }}
        <input v-model="from" type="date" />
      </label>
      <label class="filter-date">{{ t("admin_filter_to") }}
        <input v-model="to" type="date" />
      </label>
      <button class="btn sm" @click="load">{{ t("admin_filter_apply") }}</button>
      <button class="btn sm ghost" @click="reset">{{ t("admin_filter_reset") }}</button>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="orders.length === 0" class="muted center" style="padding:24px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_col_order") }}</th><th>{{ t("admin_col_user") }}</th>
          <th>{{ t("admin_col_pkg") }}</th><th>{{ t("admin_col_amount") }}</th>
          <th>{{ t("admin_col_source") }}</th><th>{{ t("admin_col_status") }}</th>
          <th>{{ t("admin_col_time") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in orders" :key="o.id">
          <td style="font-family:monospace;font-size:12px">{{ o.orderNo }}</td>
          <td>{{ o.username }}</td>
          <td>{{ o.package?.name || o.packageId }}</td>
          <td>￥{{ priceYuan(o.amountFen) }}</td>
          <td>{{ sourceLabel(o.source) }}</td>
          <td><span class="badge" :class="statusBadge(o.status)">{{ statusLabel(o.status) }}</span></td>
          <td style="font-size:12px">{{ fmt(o.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-end;
  margin-bottom: 14px;
}
.filter-q {
  min-width: 200px;
  flex: 1;
}
.filter-date {
  font-size: 12px;
  color: var(--muted, #6b7280);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>

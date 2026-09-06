<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { Overview } from "../../api/adminTypes";
import { t } from "../../i18n";
import { priceYuan } from "../../utils/format";

const data = ref<Overview | null>(null);
const loading = ref(true);
const error = ref("");

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const res = await apiGet<{ overview: Overview }>("/admin/overview", { admin: true });
    data.value = res.overview;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function stat(label: string, value: string | number): { label: string; value: string | number } {
  return { label, value };
}
</script>

<template>
  <div>
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn sm refresh" @click="load" :disabled="loading">&#x21bb; {{ t("refresh") }}</button>
    </div>

    <div v-if="loading" class="panel wide muted">{{ t("loading") }}</div>
    <div v-else-if="error" class="panel wide"><div class="alert err">{{ error }}</div></div>
    <template v-else-if="data">
      <!-- alerts -->
      <div v-if="data.alerts.length" class="panel wide" style="padding:16px 20px">
        <div v-for="(a, i) in data.alerts" :key="i" class="alert" :class="a.level === 'err' ? 'err' : 'ok'">
          {{ a.message }}
        </div>
      </div>
      <div v-else class="panel wide" style="padding:16px 20px">
        <div class="alert ok">{{ t("ov_alerts_none") }}</div>
      </div>

      <!-- KPI cards -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-num">{{ data.stats.ordersToday }}</div>
          <div class="stat-label">{{ t("ov_orders_today") }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ data.stats.ordersTotal }}</div>
          <div class="stat-label">{{ t("ov_orders_total") }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ data.stats.cardsUnused }}</div>
          <div class="stat-label">{{ t("ov_cards_unused") }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ data.stats.instActive }}<small>/{{ data.stats.instancesTotal }}</small></div>
          <div class="stat-label">{{ t("ov_instances_active") }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">{{ data.stats.nodesOnline }}<small>/{{ data.stats.nodesTotal }}</small></div>
          <div class="stat-label">{{ t("ov_nodes_online") }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-num money">&#65509;{{ priceYuan(data.stats.revenueFen) }}</div>
          <div class="stat-label">{{ t("ov_revenue") }}</div>
        </div>
      </div>

      <!-- stock table -->
      <div class="panel wide">
        <h3 style="margin:0 0 14px">{{ t("ov_stock_title") }}</h3>
        <table>
          <thead>
            <tr>
              <th>{{ t("ov_col_pkg") }}</th>
              <th>{{ t("ov_col_unused") }}</th>
              <th>{{ t("ov_col_used") }}</th>
              <th>{{ t("ov_col_status") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.stock" :key="s.packageId">
              <td>{{ s.name }}<div class="muted" style="font-size:12px">{{ s.slug }}</div></td>
              <td style="font-variant-numeric:tabular-nums;font-weight:700">{{ s.unused }}</td>
              <td class="muted" style="font-variant-numeric:tabular-nums">{{ s.used }}</td>
              <td>
                <span v-if="s.soldOut" class="badge out">{{ t("ov_stock_out") }}</span>
                <span v-else-if="s.low" class="badge exp">{{ t("ov_stock_low") }}</span>
                <span v-else class="badge run">{{ t("ov_stock_ok") }}</span>
              </td>
            </tr>
            <tr v-if="data.stock.length === 0"><td colspan="4" class="muted center">{{ t("admin_empty") }}</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.stat-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px; margin-bottom: 18px;
}
.stat-card {
  background: var(--card); border: 1px solid var(--border); border-radius: var(--radius);
  padding: 18px 18px 16px;
}
.stat-num { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.stat-num small { font-size: 15px; color: var(--muted); font-weight: 600; }
.stat-num.money { color: var(--primary); font-size: 22px; }
.stat-label { margin-top: 6px; font-size: 12.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
.badge.out { background: rgba(251, 113, 133, 0.12); color: var(--err); border-color: rgba(251, 113, 133, 0.30); }
</style>

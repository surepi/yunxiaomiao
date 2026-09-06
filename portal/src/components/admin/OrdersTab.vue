<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminOrder } from "../../api/adminTypes";
import { t } from "../../i18n";
import { priceYuan } from "../../utils/format";

const orders = ref<AdminOrder[]>([]);
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    const res = await apiGet<{ orders: AdminOrder[] }>("/admin/orders", { admin: true });
    orders.value = res.orders;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
function fmt(ts: string): string {
  return ts ? new Date(ts).toLocaleString() : "-";
}
</script>

<template>
  <div class="panel wide">
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
          <td>{{ o.source }}</td>
          <td>
            <span class="badge run" v-if="o.status === 'done'">done</span>
            <span class="badge exp" v-else-if="o.status === 'failed'">failed</span>
            <span class="badge stop" v-else>{{ o.status }}</span>
          </td>
          <td style="font-size:12px">{{ fmt(o.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

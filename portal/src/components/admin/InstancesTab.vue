<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminInstance } from "../../api/adminTypes";
import { t } from "../../i18n";

const list = ref<AdminInstance[]>([]);
const loading = ref(true);

const q = ref("");
const status = ref("");

const statusOptions = ["active", "provisioning", "expired", "archived", "failed"];
function statusLabel(st: string): string {
  if (st === "active") return t("st_active");
  if (st === "provisioning") return t("st_provisioning");
  if (st === "expired") return t("st_expired");
  if (st === "archived") return t("st_archived");
  if (st === "failed") return t("st_failed");
  return st;
}
function statusBadge(st: string): string {
  if (st === "active") return "run";
  if (st === "expired" || st === "failed" || st === "archived") return "exp";
  return "warn";
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (status.value) params.set("status", status.value);
    const res = await apiGet<{ instances: AdminInstance[] }>(`/admin/instances?${params.toString()}`, { admin: true });
    list.value = res.instances;
  } finally {
    loading.value = false;
  }
}

function reset() {
  q.value = "";
  status.value = "";
  load();
}

onMounted(load);
function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "-";
}
</script>

<template>
  <div class="panel wide">
    <div class="filter-bar">
      <input v-model="q" :placeholder="t('admin_filter_q_instances')" class="filter-q" @keyup.enter="load" />
      <select v-model="status">
        <option value="">{{ t("admin_filter_all") }}</option>
        <option v-for="st in statusOptions" :key="st" :value="st">{{ statusLabel(st) }}</option>
      </select>
      <button class="btn sm" @click="load">{{ t("admin_filter_apply") }}</button>
      <button class="btn sm ghost" @click="reset">{{ t("admin_filter_reset") }}</button>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="list.length === 0" class="muted center" style="padding:24px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_col_user") }}</th><th>{{ t("admin_col_pkg") }}</th>
          <th>{{ t("admin_col_instance") }}</th><th>{{ t("admin_col_node") }}</th>
          <th>{{ t("admin_col_status") }}</th><th>{{ t("admin_col_expire") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="i in list" :key="i.id">
          <td>{{ i.username }}</td>
          <td>{{ i.package?.name || i.categoryId }}</td>
          <td style="font-family:monospace;font-size:12px">{{ i.instanceUuid }}</td>
          <td style="font-family:monospace;font-size:12px">{{ i.daemonId.slice(0, 8) }}</td>
          <td><span class="badge" :class="statusBadge(i.status)">{{ statusLabel(i.status) }}</span></td>
          <td style="font-size:12px">{{ fmt(i.expireAt) }}</td>
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
  min-width: 220px;
  flex: 1;
}
</style>

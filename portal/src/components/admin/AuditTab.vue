<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminAuditItem } from "../../api/adminTypes";
import { t } from "../../i18n";

const logs = ref<AdminAuditItem[]>([]);
const loading = ref(true);
const q = ref("");
const admin = ref("");
const expanded = ref<number | null>(null);

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (q.value.trim()) params.set("q", q.value.trim());
    if (admin.value.trim()) params.set("admin", admin.value.trim());
    const res = await apiGet<{ logs: AdminAuditItem[] }>(`/admin/audit?${params.toString()}`, { admin: true });
    logs.value = res.logs;
  } finally {
    loading.value = false;
  }
}

function methodClass(m: string): string {
  if (m === "POST") return "run";
  if (m === "PUT") return "op";
  if (m === "DELETE") return "exp";
  return "stop";
}
function fmt(ts: string): string {
  return new Date(ts).toLocaleString();
}
function prettyDetail(d: string): string {
  try {
    return JSON.stringify(JSON.parse(d), null, 2);
  } catch {
    return d;
  }
}

onMounted(load);
</script>

<template>
  <div class="panel wide">
    <div class="gen-row" style="margin-bottom:12px">
      <label>{{ t("admin_audit_path") }}
        <input v-model="q" placeholder="/admin/cards/..." style="width:200px" @keyup.enter="load" />
      </label>
      <label>{{ t("admin_audit_admin") }}
        <input v-model="admin" style="width:130px" @keyup.enter="load" />
      </label>
      <button class="btn sm" @click="load">{{ t("admin_filter_apply") }}</button>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="logs.length === 0" class="muted center" style="padding:20px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_col_time") }}</th>
          <th>{{ t("admin_audit_admin") }}</th>
          <th>{{ t("admin_audit_method") }}</th>
          <th>{{ t("admin_audit_path") }}</th>
          <th>{{ t("admin_col_status") }}</th>
          <th>IP</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="l in logs" :key="l.id">
          <tr style="cursor:pointer" @click="expanded = expanded === l.id ? null : l.id">
            <td style="white-space:nowrap">{{ fmt(l.createdAt) }}</td>
            <td>{{ l.admin }}</td>
            <td><span class="badge" :class="methodClass(l.method)">{{ l.method }}</span></td>
            <td style="font-family:monospace;font-size:12px">{{ l.path }}</td>
            <td>
              <span class="badge" :class="l.status < 300 ? 'run' : l.status < 500 ? 'op' : 'exp'">{{ l.status }}</span>
            </td>
            <td class="muted" style="font-size:12px">{{ l.ip || "-" }}</td>
            <td><span class="muted">{{ l.detail ? (expanded === l.id ? "▾" : "▸") : "-" }}</span></td>
          </tr>
          <tr v-if="expanded === l.id && l.detail">
            <td colspan="7">
              <pre class="audit-detail">{{ prettyDetail(l.detail) }}</pre>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.audit-detail {
  margin: 0;
  padding: 10px 12px;
  background: var(--bg-soft, rgba(0, 0, 0, 0.04));
  border-radius: 6px;
  font-size: 12px;
  max-height: 240px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { WebhookEventItem } from "../../api/adminTypes";
import { t } from "../../i18n";

const list = ref<WebhookEventItem[]>([]);
const loading = ref(true);

const provider = ref("");
const sig = ref("");
const processed = ref("");
const expanded = ref<Set<number>>(new Set());

function pretty(payload: string): string {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function toggle(id: number) {
  if (expanded.value.has(id)) expanded.value.delete(id);
  else expanded.value.add(id);
  // trigger reactivity for the Set swap
  expanded.value = new Set(expanded.value);
}

async function load() {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (provider.value) params.set("provider", provider.value);
    if (sig.value) params.set("sig", sig.value);
    if (processed.value) params.set("processed", processed.value);
    const res = await apiGet<{ events: WebhookEventItem[] }>(`/admin/webhooks?${params.toString()}`, { admin: true });
    list.value = res.events;
  } finally {
    loading.value = false;
  }
}

function reset() {
  provider.value = "";
  sig.value = "";
  processed.value = "";
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
      <select v-model="provider">
        <option value="">{{ t("wh_provider_all") }}</option>
        <option value="taobao">taobao</option>
      </select>
      <select v-model="sig">
        <option value="">{{ t("wh_sig_all") }}</option>
        <option value="ok">{{ t("wh_sig_ok") }}</option>
        <option value="bad">{{ t("wh_sig_bad") }}</option>
      </select>
      <select v-model="processed">
        <option value="">{{ t("wh_proc_all") }}</option>
        <option value="no">{{ t("wh_processed_no") }}</option>
        <option value="yes">{{ t("wh_processed_yes") }}</option>
      </select>
      <button class="btn sm" @click="load">{{ t("admin_filter_apply") }}</button>
      <button class="btn sm ghost" @click="reset">{{ t("admin_filter_reset") }}</button>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="list.length === 0" class="muted center" style="padding:24px">{{ t("wh_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("wh_col_provider") }}</th>
          <th>{{ t("wh_col_event") }}</th>
          <th>{{ t("wh_col_sig") }}</th>
          <th>{{ t("wh_col_processed") }}</th>
          <th>{{ t("wh_col_time") }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="e in list" :key="e.id">
          <tr>
            <td>{{ e.provider }}</td>
            <td style="font-family:monospace;font-size:12px">{{ e.eventId || "-" }}</td>
            <td>
              <span class="badge" :class="e.signatureOk ? 'run' : 'exp'">
                {{ e.signatureOk ? t("wh_sig_ok") : t("wh_sig_bad") }}
              </span>
            </td>
            <td>
              <span class="badge" :class="e.processed ? 'run' : 'warn'">
                {{ e.processed ? t("wh_processed_yes") : t("wh_processed_no") }}
              </span>
              <div v-if="e.note" class="muted" style="font-size:11px">{{ e.note }}</div>
            </td>
            <td style="font-size:12px">{{ fmt(e.createdAt) }}</td>
            <td>
              <button class="btn sm ghost" @click="toggle(e.id)">
                {{ expanded.has(e.id) ? t("admin_cancel") : t("wh_toggle_payload") }}
              </button>
            </td>
          </tr>
          <tr v-if="expanded.has(e.id)">
            <td colspan="6">
              <pre class="payload">{{ pretty(e.payload) }}</pre>
            </td>
          </tr>
        </template>
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
.payload {
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
  padding: 12px;
  font-size: 12px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}
</style>

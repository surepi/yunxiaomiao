<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet, apiPut } from "../../api/client";
import type { AdminNode, NodeConfig } from "../../api/adminTypes";
import { t } from "../../i18n";

const nodes = ref<AdminNode[]>([]);
const loading = ref(true);
const saving = ref<string>("");
const drafts = ref<Record<string, { weight: number; maxInstances: number; enabled: boolean; note: string }>>({});

async function load() {
  loading.value = true;
  try {
    const res = await apiGet<{ nodes: AdminNode[] }>("/admin/nodes", { admin: true });
    nodes.value = res.nodes;
    for (const n of res.nodes) {
      drafts.value[n.uuid] = {
        weight: n.config?.weight ?? 1,
        maxInstances: n.config?.maxInstances ?? 0,
        enabled: n.config?.enabled ?? true,
        note: n.config?.note ?? ""
      };
    }
  } finally {
    loading.value = false;
  }
}

async function save(n: AdminNode) {
  const d = drafts.value[n.uuid];
  if (!d) return;
  saving.value = n.uuid;
  try {
    const body: Partial<NodeConfig> = {
      weight: Number(d.weight) || 1,
      maxInstances: Number(d.maxInstances) || 0,
      enabled: d.enabled,
      note: d.note
    };
    await apiPut(`/admin/nodes/config/${encodeURIComponent(n.uuid)}`, body, { admin: true });
    await load();
  } finally {
    saving.value = "";
  }
}

function loadText(n: AdminNode): string {
  const used = n.ping?.instances ?? 0;
  const cap = drafts.value[n.uuid]?.maxInstances ?? 0;
  return cap > 0 ? `${used} / ${cap}` : `${used}`;
}

onMounted(load);
</script>

<template>
  <div class="panel wide">
    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_nodes_addr") }}</th>
          <th>{{ t("admin_nodes_remark") }}</th>
          <th>{{ t("admin_col_status") }}</th>
          <th>{{ t("admin_nodes_running") }}</th>
          <th>{{ t("admin_nodes_load") }}</th>
          <th>{{ t("admin_nodes_weight") }}</th>
          <th>{{ t("admin_nodes_cap") }}</th>
          <th>{{ t("admin_nodes_enabled") }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="n in nodes" :key="n.uuid">
          <td style="font-family:monospace;font-size:12px">{{ n.ip }}:{{ n.port }}</td>
          <td>
            {{ n.remarks || n.ping?.name || "-" }}
            <input
              v-model="drafts[n.uuid].note"
              :placeholder="t('admin_nodes_note_ph')"
              style="width:110px;margin-left:6px"
            />
          </td>
          <td>
            <span class="badge run" v-if="n.available && n.ping?.available">{{ t("admin_nodes_online") }}</span>
            <span class="badge exp" v-else>{{ t("admin_nodes_offline") }}</span>
          </td>
          <td>{{ n.ping?.running ?? "-" }}</td>
          <td>{{ n.ping ? loadText(n) : "-" }}</td>
          <td><input v-model.number="drafts[n.uuid].weight" type="number" min="1" max="100" style="width:70px" /></td>
          <td><input v-model.number="drafts[n.uuid].maxInstances" type="number" min="0" style="width:80px" :title="t('admin_nodes_cap_hint')" /></td>
          <td>
            <label style="font-weight:400">
              <input type="checkbox" v-model="drafts[n.uuid].enabled" style="width:auto" />
              {{ drafts[n.uuid].enabled ? t("admin_status_on") : t("admin_status_off") }}
            </label>
          </td>
          <td>
            <button class="btn sm ghost" :disabled="saving === n.uuid" @click="save(n)">
              {{ saving === n.uuid ? t("saving") : t("admin_save") }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <p class="muted" style="margin-top:10px;font-size:12px">{{ t("admin_nodes_hint") }}</p>
  </div>
</template>

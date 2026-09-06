<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminNode } from "../../api/adminTypes";
import { t } from "../../i18n";

const nodes = ref<AdminNode[]>([]);
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    const res = await apiGet<{ nodes: AdminNode[] }>("/admin/nodes", { admin: true });
    nodes.value = res.nodes;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>

<template>
  <div class="panel wide">
    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>节点地址</th><th>备注</th><th>状态</th>
          <th>{{ t("admin_nodes_running") }}</th><th>{{ t("admin_nodes_total") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="n in nodes" :key="n.uuid">
          <td>{{ n.ip }}:{{ n.port }}</td>
          <td>{{ n.remarks || n.ping?.name || "-" }}</td>
          <td>
            <span class="badge run" v-if="n.available && n.ping?.available">{{ t("admin_nodes_online") }}</span>
            <span class="badge exp" v-else>{{ t("admin_nodes_offline") }}</span>
          </td>
          <td>{{ n.ping?.running ?? "-" }}</td>
          <td>{{ n.ping?.instances ?? "-" }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

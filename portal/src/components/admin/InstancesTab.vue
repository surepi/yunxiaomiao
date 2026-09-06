<script setup lang="ts">
import { onMounted, ref } from "vue";
import { apiGet } from "../../api/client";
import type { AdminInstance } from "../../api/adminTypes";
import { t } from "../../i18n";

const list = ref<AdminInstance[]>([]);
const loading = ref(true);
async function load() {
  loading.value = true;
  try {
    const res = await apiGet<{ instances: AdminInstance[] }>("/admin/instances", { admin: true });
    list.value = res.instances;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "-";
}
</script>

<template>
  <div class="panel wide">
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
          <td>
            <span class="badge run" v-if="i.status === 'active'">active</span>
            <span class="badge exp" v-else-if="i.status === 'expired'">expired</span>
            <span class="badge stop" v-else>{{ i.status }}</span>
          </td>
          <td style="font-size:12px">{{ fmt(i.expireAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

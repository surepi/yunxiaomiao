<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAdminStore } from "../../stores/admin";
import { t } from "../../i18n";
import OverviewTab from "../../components/admin/OverviewTab.vue";
import NodesTab from "../../components/admin/NodesTab.vue";
import PackagesTab from "../../components/admin/PackagesTab.vue";
import CardsTab from "../../components/admin/CardsTab.vue";
import OrdersTab from "../../components/admin/OrdersTab.vue";
import InstancesTab from "../../components/admin/InstancesTab.vue";

const admin = useAdminStore();
const router = useRouter();
const tab = ref<"overview" | "nodes" | "packages" | "cards" | "orders" | "instances">("overview");
const tabs = [
  { key: "overview", label: t("admin_tab_overview") },
  { key: "nodes", label: t("admin_tab_nodes") },
  { key: "packages", label: t("admin_tab_packages") },
  { key: "cards", label: t("admin_tab_cards") },
  { key: "orders", label: t("admin_tab_orders") },
  { key: "instances", label: t("admin_tab_instances") }
] as const;

function logout() {
  admin.logout();
  router.push("/console/login");
}
</script>

<template>
  <div class="container section">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h2 style="margin:0">{{ t("admin_brand") }} · {{ admin.username }}</h2>
      <div style="display:flex;gap:10px">
        <router-link to="/" class="btn sm ghost">{{ t("admin_back") }}</router-link>
        <button class="btn sm" @click="logout">{{ t("admin_logout") }}</button>
      </div>
    </div>

    <div class="tabs admin-tabs">
      <button
        v-for="tb in tabs"
        :key="tb.key"
        :class="{ active: tab === tb.key }"
        @click="tab = tb.key"
      >
        {{ tb.label }}
      </button>
    </div>

    <OverviewTab v-if="tab === 'overview'" />
    <NodesTab v-else-if="tab === 'nodes'" />
    <PackagesTab v-else-if="tab === 'packages'" />
    <CardsTab v-else-if="tab === 'cards'" />
    <OrdersTab v-else-if="tab === 'orders'" />
    <InstancesTab v-else-if="tab === 'instances'" />
  </div>
</template>

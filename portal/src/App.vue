<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { apiGet } from "./api/client";
import { t } from "./i18n";

interface Banner {
  id: number;
  title: string;
  content: string;
  level: "info" | "warn" | "critical";
}

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const bare = computed(() => Boolean(route.meta.bare));

const banners = ref<Banner[]>([]);
const dismissed = ref<Set<number>>(new Set());

function loadDismissed(): void {
  try {
    const raw = JSON.parse(localStorage.getItem("gw_dismissed_ann") || "[]") as number[];
    dismissed.value = new Set(Array.isArray(raw) ? raw : []);
  } catch {
    dismissed.value = new Set();
  }
}

function dismiss(id: number): void {
  dismissed.value.add(id);
  localStorage.setItem("gw_dismissed_ann", JSON.stringify(Array.from(dismissed.value)));
}

onMounted(async () => {
  loadDismissed();
  try {
    const res = await apiGet<{ announcements: Banner[] }>("/announcements");
    banners.value = (res.announcements || []).filter((a) => !dismissed.value.has(a.id));
  } catch {
    // Banner is non-critical; silently ignore fetch failures.
  }
});

function logout() {
  auth.logout();
  router.push("/");
}
</script>

<template>
  <div>
    <header v-if="!bare" class="nav">
      <div class="container nav-inner">
        <span class="brand">{{ t("brand") }}</span>
        <nav class="nav-links">
          <router-link to="/">{{ t("nav_home") }}</router-link>
          <router-link to="/open">{{ t("nav_open") }}</router-link>
          <router-link to="/services">{{ t("nav_services") }}</router-link>
          <router-link v-if="auth.isLoggedIn" to="/account">{{ t("nav_account") }}</router-link>
          <router-link to="/console" class="admin-link">{{ t("admin_brand") }}</router-link>
        </nav>
        <div class="nav-user">
          <template v-if="auth.isLoggedIn">
            <span class="uname">{{ auth.username }}</span>
            <button class="btn sm ghost" @click="logout">{{ t("nav_logout") }}</button>
          </template>
          <template v-else>
            <router-link class="btn sm" to="/login">{{ t("nav_login") }}</router-link>
          </template>
        </div>
      </div>
    </header>

    <div v-if="!bare && banners.length" class="ann-banner-wrap">
      <div
        v-for="b in banners"
        :key="b.id"
        class="ann-banner"
        :class="`ann-${b.level}`"
      >
        <div class="ann-body">
          <strong v-if="b.title" class="ann-title">{{ b.title }}</strong>
          <span class="ann-content">{{ b.content }}</span>
        </div>
        <button class="ann-close" @click="dismiss(b.id)" aria-label="dismiss">×</button>
      </div>
    </div>

    <router-view />
  </div>
</template>

<style scoped>
.ann-banner-wrap {
  max-width: 1080px;
  margin: 10px auto 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ann-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
  border: 1px solid;
}
.ann-body {
  flex: 1;
}
.ann-title {
  margin-right: 8px;
}
.ann-content {
  white-space: pre-wrap;
}
.ann-close {
  border: none;
  background: transparent;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.6;
  padding: 2px 4px;
}
.ann-close:hover {
  opacity: 1;
}
.ann-info {
  background: rgba(14, 165, 233, 0.1);
  border-color: rgba(14, 165, 233, 0.35);
  color: #075985;
}
.ann-warn {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #92400e;
}
.ann-critical {
  background: rgba(251, 113, 133, 0.12);
  border-color: rgba(251, 113, 133, 0.45);
  color: #9f1239;
}
</style>

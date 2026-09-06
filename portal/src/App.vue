<script setup lang="ts">
import { useRouter } from "vue-router";
import { useAuthStore } from "./stores/auth";
import { t } from "./i18n";

const auth = useAuthStore();
const router = useRouter();

function logout() {
  auth.logout();
  router.push("/");
}
</script>

<template>
  <div>
    <header class="nav">
      <div class="container nav-inner">
        <span class="brand">{{ t("brand") }}</span>
        <nav class="nav-links">
          <router-link to="/">{{ t("nav_home") }}</router-link>
          <router-link to="/open">{{ t("nav_open") }}</router-link>
          <router-link to="/services">{{ t("nav_services") }}</router-link>
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

    <router-view />
  </div>
</template>

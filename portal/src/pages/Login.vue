<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { t } from "../i18n";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const mode = ref<"login" | "register">("login");
const username = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    if (mode.value === "login") {
      await auth.login(username.value.trim(), password.value);
    } else {
      await auth.register(username.value.trim(), password.value);
    }
    const redirect = (route.query.redirect as string) || "/services";
    router.push(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container">
    <div class="panel">
      <div class="tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">{{ t("tab_login") }}</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">{{ t("tab_register") }}</button>
      </div>
      <h2>{{ mode === "login" ? t("login_title") : t("register_title") }}</h2>
      <form @submit.prevent="submit">
        <div class="field">
          <label>{{ t("username") }}</label>
          <input v-model="username" autocomplete="username" placeholder="tbplayer01" />
        </div>
        <div class="field">
          <label>{{ t("password") }}</label>
          <input v-model="password" type="password" autocomplete="current-password" />
          <div class="hint">{{ t("password_hint") }}</div>
        </div>
        <div v-if="error" class="alert err">{{ error }}</div>
        <button class="btn" style="width: 100%" :disabled="busy">
          {{ mode === "login" ? t("login_btn") : t("register_btn") }}
        </button>
      </form>
    </div>
  </div>
</template>

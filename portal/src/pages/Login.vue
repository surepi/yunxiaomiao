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
const email = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    if (mode.value === "login") {
      await auth.login(username.value.trim(), password.value);
    } else {
      await auth.register(username.value.trim(), password.value, email.value.trim());
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
        <div v-if="mode === 'register'" class="field">
          <label>{{ t("email") }}</label>
          <input v-model="email" type="email" autocomplete="email" placeholder="you@example.com" />
          <div class="hint">{{ t("email_hint") }}</div>
        </div>
        <div class="field">
          <label>{{ t("password") }}</label>
          <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" />
          <div class="hint">{{ t("password_hint") }}</div>
        </div>
        <div v-if="mode === 'login'" class="field" style="text-align: right">
          <router-link to="/reset" class="link">{{ t("login_forgot") }}</router-link>
        </div>
        <div v-if="error" class="alert err">{{ error }}</div>
        <button class="btn" style="width: 100%" :disabled="busy">
          {{ mode === "login" ? t("login_btn") : t("register_btn") }}
        </button>
      </form>
    </div>
  </div>
</template>

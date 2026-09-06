<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAdminStore } from "../../stores/admin";
import { t } from "../../i18n";

const admin = useAdminStore();
const router = useRouter();
const username = ref("");
const password = ref("");
const error = ref("");
const busy = ref(false);

async function submit() {
  error.value = "";
  busy.value = true;
  try {
    await admin.login(username.value.trim(), password.value);
    router.push("/console");
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
      <h2>{{ t("admin_login_title") }}</h2>
      <form @submit.prevent="submit">
        <div class="field">
          <label>{{ t("admin_username") }}</label>
          <input v-model="username" autocomplete="username" />
        </div>
        <div class="field">
          <label>{{ t("admin_password") }}</label>
          <input v-model="password" type="password" autocomplete="current-password" />
        </div>
        <div v-if="error" class="alert err">{{ error }}</div>
        <button class="btn" style="width:100%" :disabled="busy">{{ t("admin_login_btn") }}</button>
      </form>
      <p style="margin-top:14px"><router-link to="/">← {{ t("admin_back") }}</router-link></p>
    </div>
  </div>
</template>

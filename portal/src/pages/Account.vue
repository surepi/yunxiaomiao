<script setup lang="ts">
import { ref } from "vue";
import { useAuthStore } from "../stores/auth";
import { apiPost } from "../api/client";
import { t } from "../i18n";

const auth = useAuthStore();

const oldPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const busy = ref(false);
const error = ref("");
const ok = ref("");

function strongEnough(pw: string): boolean {
  return pw.length >= 9 && pw.length <= 36 && /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(pw);
}

async function submit() {
  error.value = "";
  ok.value = "";
  const next = newPassword.value;
  if (!oldPassword.value) {
    error.value = t("account_err_old_required");
    return;
  }
  if (!strongEnough(next)) {
    error.value = t("account_err_weak");
    return;
  }
  if (next !== confirmPassword.value) {
    error.value = t("account_err_mismatch");
    return;
  }
  if (next === oldPassword.value) {
    error.value = t("account_err_same");
    return;
  }
  busy.value = true;
  try {
    await apiPost("/auth/password", {
      oldPassword: oldPassword.value,
      newPassword: next
    });
    ok.value = t("account_ok");
    oldPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="container section">
    <h2>{{ t("account_title") }}</h2>

    <div class="panel" style="margin-top:20px;max-width:520px">
      <div class="field">
        <label>{{ t("account_username") }}</label>
        <div class="muted" style="font-size:16px;font-weight:600">{{ auth.username }}</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;max-width:520px">
      <h3 style="margin-top:0">{{ t("account_change_pw") }}</h3>
      <form @submit.prevent="submit">
        <div class="field">
          <label>{{ t("account_old_pw") }}</label>
          <input v-model="oldPassword" type="password" autocomplete="current-password" />
        </div>
        <div class="field">
          <label>{{ t("account_new_pw") }}</label>
          <input v-model="newPassword" type="password" autocomplete="new-password" />
          <div class="muted" style="font-size:12px;margin-top:4px">{{ t("account_pw_hint") }}</div>
        </div>
        <div class="field">
          <label>{{ t("account_confirm_pw") }}</label>
          <input v-model="confirmPassword" type="password" autocomplete="new-password" />
        </div>
        <div v-if="error" class="alert err">{{ error }}</div>
        <div v-if="ok" class="alert ok">{{ ok }}</div>
        <button class="btn" style="width:100%" :disabled="busy || !oldPassword || !newPassword || !confirmPassword">
          {{ busy ? t("account_saving") : t("account_save") }}
        </button>
      </form>
    </div>
  </div>
</template>

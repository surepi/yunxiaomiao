<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { t } from "../i18n";

const auth = useAuthStore();
const route = useRoute();

const token = computed(() => String(route.query.token || ""));
const hasToken = computed(() => token.value.length > 0);

const account = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const busy = ref(false);
const error = ref("");
const ok = ref("");

function strongEnough(pw: string): boolean {
  return pw.length >= 9 && pw.length <= 36 && /(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])/.test(pw);
}

async function requestLink() {
  error.value = "";
  ok.value = "";
  if (!account.value.trim()) {
    error.value = t("forgot_account");
    return;
  }
  busy.value = true;
  try {
    await auth.forgotPassword(account.value.trim());
    ok.value = t("forgot_ok");
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}

async function submitReset() {
  error.value = "";
  ok.value = "";
  if (!strongEnough(newPassword.value)) {
    error.value = t("reset_err_weak");
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = t("reset_err_mismatch");
    return;
  }
  busy.value = true;
  try {
    await auth.resetPassword(token.value, newPassword.value);
    ok.value = t("reset_ok");
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
  <div class="container">
    <div class="panel">
      <template v-if="!hasToken">
        <h2>{{ t("forgot_title") }}</h2>
        <p class="hint" style="margin: 0 0 8px">{{ t("forgot_desc") }}</p>
        <form @submit.prevent="requestLink">
          <div class="field">
            <label>{{ t("forgot_account") }}</label>
            <input v-model="account" autocomplete="username" placeholder="tbplayer01 / you@example.com" />
          </div>
          <div v-if="error" class="alert err">{{ error }}</div>
          <div v-if="ok" class="alert ok">{{ ok }}</div>
          <button class="btn" style="width: 100%" :disabled="busy">
            {{ busy ? t("forgot_sending") : t("forgot_btn") }}
          </button>
        </form>
      </template>

      <template v-else>
        <h2>{{ t("reset_title") }}</h2>
        <p class="hint" style="margin: 0 0 8px">{{ t("reset_desc") }}</p>
        <form @submit.prevent="submitReset">
          <div class="field">
            <label>{{ t("reset_new_pw") }}</label>
            <input v-model="newPassword" type="password" autocomplete="new-password" />
            <div class="hint">{{ t("password_hint") }}</div>
          </div>
          <div class="field">
            <label>{{ t("reset_confirm_pw") }}</label>
            <input v-model="confirmPassword" type="password" autocomplete="new-password" />
          </div>
          <div v-if="error" class="alert err">{{ error }}</div>
          <div v-if="ok" class="alert ok">{{ ok }}</div>
          <button class="btn" style="width: 100%" :disabled="busy || !!ok">
            {{ busy ? t("reset_resetting") : t("reset_btn") }}
          </button>
        </form>
      </template>

      <p style="margin-top: 14px; text-align: center">
        <router-link to="/login">← {{ t("back_to_login") }}</router-link>
      </p>
    </div>
  </div>
</template>

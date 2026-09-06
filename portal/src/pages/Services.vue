<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import type { MyInstance } from "../api/types";
import { t } from "../i18n";
import { expireCountdown, daysLeft, copyText, formatDateTime } from "../utils/format";

const router = useRouter();
const instances = ref<MyInstance[]>([]);
const loading = ref(true);
const error = ref("");
const copiedId = ref("");

const renewOpen = ref(false);
const renewTarget = ref<MyInstance | null>(null);
const renewCode = ref("");
const renewBusy = ref(false);
const renewError = ref("");

function expireMs(i: MyInstance): number {
  return i.expireAt ? new Date(i.expireAt).getTime() : i.expire || 0;
}
function isExpired(i: MyInstance): boolean {
  const ms = expireMs(i);
  return ms > 0 && ms < Date.now();
}
function isNear(i: MyInstance): boolean {
  const ms = expireMs(i);
  return !isExpired(i) && ms > 0 && daysLeft(ms) <= 3;
}
function countdown(i: MyInstance): string {
  return expireCountdown(expireMs(i));
}
function expireDate(i: MyInstance): string {
  return formatDateTime(expireMs(i));
}
function addresses(i: MyInstance): string[] {
  if (!i.ports || i.ports.length === 0) return [];
  return i.ports.map((p) => `${i.nodeHost ? i.nodeHost + ":" : ""}${p.host}`);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const res = await apiGet<{ instances: MyInstance[] }>("/instances");
    instances.value = res.instances;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    loading.value = false;
  }
}

async function copyAddr(i: MyInstance) {
  const lines = addresses(i);
  if (lines.length === 0) return;
  const ok = await copyText(lines.join("\n"));
  if (ok) {
    copiedId.value = i.instance_id;
    setTimeout(() => (copiedId.value = ""), 1500);
  }
}

async function openConsole(i: MyInstance) {
  try {
    const res = await apiPost<{ url: string }>("/instances/sso", { instanceId: i.instance_id });
    window.open(res.url, "_blank");
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  }
}

function startRenew(i: MyInstance) {
  renewTarget.value = i;
  renewCode.value = "";
  renewError.value = "";
  renewOpen.value = true;
}
async function submitRenew() {
  if (!renewTarget.value) return;
  renewBusy.value = true;
  renewError.value = "";
  try {
    await apiPost("/renew", {
      code: renewCode.value.trim().toUpperCase(),
      instanceId: renewTarget.value.instance_id
    });
    renewOpen.value = false;
    await load();
  } catch (e) {
    renewError.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    renewBusy.value = false;
  }
}

const actionMsg = ref("");
const busyKey = ref("");

function isRunning(i: MyInstance): boolean {
  return i.status === 3;
}
function busyAction(i: MyInstance): string {
  const prefix = i.instance_id + ":";
  return busyKey.value.startsWith(prefix) ? busyKey.value.slice(prefix.length) : "";
}
async function control(i: MyInstance, action: "open" | "stop" | "restart") {
  if (action === "stop" && !confirm(t("confirm_stop"))) return;
  busyKey.value = i.instance_id + ":" + action;
  error.value = "";
  actionMsg.value = "";
  try {
    await apiPost("/instances/action", { instanceId: i.instance_id, action });
    actionMsg.value = t("action_sent");
    setTimeout(load, 2000);
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busyKey.value = "";
  }
}

onMounted(load);
</script>

<template>
  <div class="container section">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
      <h2 style="margin:0">{{ t("services_title") }}</h2>
      <button class="btn sm refresh" @click="load" :disabled="loading">↻ {{ t("refresh") }}</button>
    </div>

    <div class="panel wide" style="margin-top:20px">
      <div v-if="actionMsg" class="alert ok">{{ actionMsg }}</div>
      <div v-if="loading" class="muted">{{ t("loading") }}</div>
      <div v-else-if="error" class="alert err">{{ error }}</div>
      <div v-else-if="instances.length === 0" class="muted center" style="padding:36px 0">
        <div style="margin-bottom:14px">{{ t("services_empty") }}</div>
        <button class="btn" @click="router.push('/open')">{{ t("services_go_open") }}</button>
      </div>

      <table v-else>
        <thead>
          <tr>
            <th>{{ t("col_name") }}</th>
            <th>{{ t("col_status") }}</th>
            <th>{{ t("col_expire") }}</th>
            <th>{{ t("col_addr") }}</th>
            <th>{{ t("col_action") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="i in instances" :key="i.instance_id">
            <td>{{ i.name || i.instance_id.slice(0, 8) }}</td>
            <td>
              <span v-if="isExpired(i)" class="badge exp">{{ t("expired") }}</span>
              <span v-else-if="i.status === 3" class="badge run">{{ t("status_running") }}</span>
              <span v-else class="badge stop">{{ t("status_stopped") }}</span>
            </td>
            <td>
              <div class="countdown" :class="{ exp: isExpired(i), warn: isNear(i) }">{{ countdown(i) }}</div>
              <div class="muted" style="font-size:12px">{{ expireDate(i) }}</div>
            </td>
            <td>
              <div class="addr-list" v-if="addresses(i).length">
                <span class="addr" v-for="(a, idx) in addresses(i)" :key="idx">
                  {{ a }}
                </span>
                <button class="copy-btn" @click="copyAddr(i)">
                  {{ copiedId === i.instance_id ? t("copied") : t("btn_copy") }}
                </button>
              </div>
              <span v-else class="muted">{{ t("no_addr") }}</span>
            </td>
            <td>
              <div class="row-actions">
                <template v-if="!isExpired(i)">
                  <button v-if="!isRunning(i)" class="btn sm" :disabled="!!busyAction(i)" @click="control(i, 'open')">
                    {{ busyAction(i) === 'open' ? t('action_working') : t('btn_start') }}
                  </button>
                  <template v-else>
                    <button class="btn sm" :disabled="!!busyAction(i)" @click="control(i, 'restart')">
                      {{ busyAction(i) === 'restart' ? t('action_working') : t('btn_restart') }}
                    </button>
                    <button class="btn sm ghost" :disabled="!!busyAction(i)" @click="control(i, 'stop')">
                      {{ busyAction(i) === 'stop' ? t('action_working') : t('btn_stop') }}
                    </button>
                  </template>
                </template>
                <button class="btn sm" @click="openConsole(i)">{{ t("btn_console") }}</button>
                <button class="btn sm ghost" @click="startRenew(i)">{{ t("btn_renew") }}</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="renewOpen && renewTarget" class="panel">
      <h2>{{ t("renew_title") }}</h2>
      <p class="muted">{{ renewTarget.name || renewTarget.instance_id.slice(0, 8) }} — {{ t("renew_desc") }}</p>
      <div class="renew-current">{{ t("renew_current") }}：{{ expireDate(renewTarget) }}</div>
      <form @submit.prevent="submitRenew">
        <div class="field">
          <label>{{ t("code_label") }}</label>
          <input v-model="renewCode" :placeholder="t('code_placeholder')" />
        </div>
        <div v-if="renewError" class="alert err">{{ renewError }}</div>
        <button class="btn" style="width:100%" :disabled="renewBusy || !renewCode.trim()">
          {{ renewBusy ? t("renewing") : t("renew_btn") }}
        </button>
      </form>
    </div>
  </div>
</template>

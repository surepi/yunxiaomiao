<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import type { MyInstance } from "../api/types";
import { t } from "../i18n";

const route = useRoute();
const router = useRouter();

const instances = ref<MyInstance[]>([]);
const loading = ref(true);
const error = ref("");
const selectedId = ref<string>("");
const frameUrl = ref<string>("");
const frameLoading = ref(false);
const busy = ref(false);

const selected = computed<MyInstance | null>(
  () => instances.value.find((i) => i.instance_id === selectedId.value) ?? null
);

function isExpired(i: MyInstance): boolean {
  const ms = i.expireAt ? new Date(i.expireAt).getTime() : i.expire || 0;
  return ms > 0 && ms < Date.now();
}
function label(i: MyInstance): string {
  return i.name || i.instance_id.slice(0, 8);
}

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const res = await apiGet<{ instances: MyInstance[] }>("/instances");
    instances.value = res.instances;
    const want = (route.query.instance as string) || "";
    const preferred =
      instances.value.find((i) => i.instance_id === want) ||
      instances.value.find((i) => i.status === 3 && !isExpired(i)) ||
      instances.value[0];
    if (preferred) await open(preferred.instance_id);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    loading.value = false;
  }
}

/** Mint a fresh single-use SSO link and point the iframe at it. */
async function open(instanceId: string) {
  if (!instanceId) return;
  selectedId.value = instanceId;
  busy.value = true;
  error.value = "";
  try {
    const res = await apiPost<{ url: string }>("/instances/sso", { instanceId });
    frameLoading.value = true;
    frameUrl.value = res.url;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}

/** The SSO token is single-use, so a new-tab open mints a fresh link. */
async function openInNewTab() {
  if (!selectedId.value) return;
  busy.value = true;
  try {
    const res = await apiPost<{ url: string }>("/instances/sso", { instanceId: selectedId.value });
    window.open(res.url, "_blank", "noopener");
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}

function reloadFrame() {
  // The panel is a cross-origin (subdomain) iframe, so re-mint a fresh SSO
  // link and re-point the iframe rather than touching contentWindow.
  if (selectedId.value) void open(selectedId.value);
}

onMounted(load);
</script>

<template>
  <div class="embed-wrap">
    <div class="embed-bar container">
      <div class="embed-bar-left">
        <button class="btn sm ghost" @click="router.push('/services')">← {{ t("embed_back") }}</button>
        <label class="embed-select">
          <span>{{ t("embed_instance") }}</span>
          <select
            :value="selectedId"
            :disabled="busy || instances.length === 0"
            @change="open(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="i in instances" :key="i.instance_id" :value="i.instance_id">
              {{ label(i) }}{{ isExpired(i) ? "（" + t("expired") + "）" : "" }}
            </option>
          </select>
        </label>
        <span v-if="selected" class="muted embed-node">{{ selected.nodeName || selected.nodeHost }}</span>
      </div>
      <div class="embed-bar-right">
        <button class="btn sm ghost" :disabled="!frameUrl" @click="reloadFrame">{{ t("embed_reload") }}</button>
        <button class="btn sm" :disabled="busy || !selectedId" @click="openInNewTab">{{ t("embed_newtab") }}</button>
      </div>
    </div>

    <div class="embed-frame-box">
      <div v-if="loading" class="muted embed-hint">{{ t("loading") }}</div>
      <div v-else-if="instances.length === 0" class="embed-hint">
        <p>{{ t("embed_empty") }}</p>
        <router-link class="btn" to="/open">{{ t("nav_open") }}</router-link>
      </div>
      <template v-else>
        <div v-if="frameLoading" class="muted embed-loading">{{ t("embed_loading") }}</div>
        <iframe
          id="mcsm-iframe"
          :src="frameUrl"
          :title="t('embed_title')"
          class="embed-frame"
          allow="clipboard-read; clipboard-write; fullscreen"
          @load="frameLoading = false"
        ></iframe>
      </template>
      <div v-if="error" class="alert err embed-error">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.embed-wrap {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 560px;
}
.embed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  flex: none;
  flex-wrap: wrap;
}
.embed-bar-left,
.embed-bar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.embed-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}
.embed-select select {
  min-width: 180px;
}
.embed-node {
  font-size: 12px;
}
.embed-frame-box {
  position: relative;
  flex: 1;
  min-height: 0;
}
.embed-frame {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
  background: var(--bg-elev, #0b0e14);
}
.embed-hint,
.embed-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  z-index: 2;
  pointer-events: none;
}
.embed-loading {
  background: rgba(11, 14, 20, 0.55);
}
.embed-error {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 16px;
  z-index: 3;
}
</style>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { apiGet, apiPost } from "../api/client";
import type { RedeemResult, NodeOption } from "../api/types";
import { t } from "../i18n";
import { formatDateTime } from "../utils/format";

const router = useRouter();
const code = ref("");
const busy = ref(false);
const error = ref("");
const result = ref<RedeemResult | null>(null);
const nodes = ref<NodeOption[]>([]);
const selectedNode = ref("");

onMounted(async () => {
  try {
    const res = await apiGet<{ nodes: NodeOption[] }>("/nodes");
    nodes.value = res.nodes;
  } catch {
    // Picker is optional; redeem falls back to automatic scheduling.
  }
});

const steps = [t("step_verify"), t("step_node"), t("step_create"), t("step_done")];
const activeStep = ref(-1);
let timer: ReturnType<typeof setInterval> | null = null;

onUnmounted(() => {
  if (timer) clearInterval(timer);
});

async function submit() {
  error.value = "";
  result.value = null;
  busy.value = true;
  activeStep.value = 0;
  timer = setInterval(() => {
    if (activeStep.value < 2) activeStep.value += 1;
  }, 900);

  try {
    result.value = await apiPost<RedeemResult>("/redeem", {
      code: code.value.trim().toUpperCase(),
      nodeId: selectedNode.value || undefined
    });
    activeStep.value = 3;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t("err_generic");
    activeStep.value = -1;
  } finally {
    if (timer) clearInterval(timer);
    timer = null;
    busy.value = false;
  }
}
</script>

<template>
  <div class="container">
    <div class="panel">
      <h2>{{ t("open_title") }}</h2>
      <p class="muted">{{ t("open_desc") }}</p>

      <div v-if="!result">
        <form @submit.prevent="submit">
          <div class="field">
            <label>{{ t("open_node_title") }}</label>
            <div class="node-grid">
              <button
                type="button"
                class="node-opt"
                :class="{ active: selectedNode === '' }"
                :disabled="busy"
                @click="selectedNode = ''"
              >
                <span class="node-dot auto"></span>
                <span class="node-meta">
                  <span class="node-name">{{ t("node_auto") }}</span>
                  <span class="node-load">{{ t("node_auto_hint") }}</span>
                </span>
              </button>
              <button
                v-for="n in nodes"
                :key="n.id"
                type="button"
                class="node-opt"
                :class="{ active: selectedNode === n.id }"
                :disabled="busy"
                @click="selectedNode = n.id"
              >
                <span class="node-dot"></span>
                <span class="node-meta">
                  <span class="node-name">{{ n.name }}</span>
                  <span class="node-load">{{ t("node_load", { running: n.running, total: n.instances }) }}</span>
                </span>
              </button>
            </div>
          </div>
          <div class="field">
            <label>{{ t("code_label") }}</label>
            <input v-model="code" :placeholder="t('code_placeholder')" :disabled="busy" />
          </div>

          <ul class="stepper" v-if="busy || activeStep >= 0">
            <li
              v-for="(label, i) in steps"
              :key="i"
              :class="{ done: activeStep > i, active: activeStep === i }"
            >
              <span class="dot">
                <span v-if="activeStep > i">✓</span>
                <span v-else-if="activeStep === i && i < 3" class="spinner"></span>
                <span v-else>{{ i + 1 }}</span>
              </span>
              {{ label }}
            </li>
          </ul>

          <div v-if="error" class="alert err">{{ error }}</div>
          <button class="btn" style="width: 100%" :disabled="busy || !code.trim()">
            {{ busy ? t("opening") : t("open_btn") }}
          </button>
        </form>
      </div>

      <div v-else>
        <div class="alert ok">{{ t("open_success") }}</div>
        <div class="result-box">
          <div class="row"><span class="k">{{ t("open_result_id") }}</span><span class="v">{{ result.instanceId }}</span></div>
          <div class="row" v-if="result.nodeRemarks"><span class="k">{{ t("open_result_node") }}</span><span class="v">{{ result.nodeRemarks }}</span></div>
          <div class="row"><span class="k">{{ t("open_result_expire") }}</span><span class="v">{{ formatDateTime(result.expire) }}</span></div>
        </div>
        <p class="muted">{{ t("open_result_tip") }}</p>
        <button class="btn" style="width: 100%" @click="router.push('/services')">
          {{ t("go_services") }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; margin-bottom: 4px; }
.node-opt {
  display: flex; align-items: center; gap: 10px; text-align: left; width: 100%;
  background: var(--input); border: 1px solid var(--border); border-radius: 9px;
  padding: 11px 12px; cursor: pointer; color: var(--text);
  transition: border-color .15s, background .15s, box-shadow .15s;
}
.node-opt:hover:not(:disabled) { border-color: var(--border-strong); }
.node-opt.active { border-color: var(--primary); background: var(--primary-dim); box-shadow: inset 0 0 0 1px var(--primary); }
.node-opt:disabled { opacity: .55; cursor: not-allowed; }
.node-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.node-name { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.node-load { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.node-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 8px rgba(52, 211, 153, .6); flex: none; }
.node-dot.auto { background: var(--primary); }
</style>

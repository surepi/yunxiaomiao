<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { apiGet, apiPost, apiPut, apiDel } from "../../api/client";
import type { AdminPackage, AdminNode, QuickTemplate } from "../../api/adminTypes";
import { t } from "../../i18n";
import { priceYuan, daysText } from "../../utils/format";

const packages = ref<AdminPackage[]>([]);
const nodes = ref<AdminNode[]>([]);
const loading = ref(true);
const showForm = ref(false);
const editingId = ref<number | null>(null);
const formError = ref("");
const formOk = ref("");

interface PkgForm {
  name: string;
  slug: string;
  description: string;
  priceFen: number;
  hours: number;
  mcsmCategoryId: number;
  nodeStrategy: "auto" | "fixed";
  fixedNodeId: string;
  active: boolean;
  sort: number;
  setupInfo: string;
  resourceLimits: string;
}

const form = reactive<PkgForm>({
  name: "", slug: "", description: "", priceFen: 0, hours: 720,
  mcsmCategoryId: 1, nodeStrategy: "auto", fixedNodeId: "", active: true, sort: 0,
  setupInfo: "{}", resourceLimits: "{}"
});

// Official quick-start template picker state.
const showTemplates = ref(false);
const templates = ref<QuickTemplate[]>([]);
const templatesLoading = ref(false);
const templatesLoaded = ref(false);
const templateKeyword = ref("");
const templateError = ref("");

const filteredTemplates = computed<QuickTemplate[]>(() => {
  const keyword = templateKeyword.value.trim().toLowerCase();
  if (!keyword) return templates.value;
  return templates.value.filter((tpl) =>
    [tpl.title, tpl.description ?? "", tpl.gameType ?? "", tpl.category ?? "", tpl.platform ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(keyword)
  );
});

async function load() {
  loading.value = true;
  try {
    const [p, n] = await Promise.all([
      apiGet<{ packages: AdminPackage[] }>("/admin/packages", { admin: true }),
      apiGet<{ nodes: AdminNode[] }>("/admin/nodes", { admin: true }).catch(() => ({ nodes: [] }))
    ]);
    packages.value = p.packages;
    nodes.value = n.nodes;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, {
    name: "", slug: "", description: "", priceFen: 0, hours: 720,
    mcsmCategoryId: 1, nodeStrategy: "auto", fixedNodeId: "", active: true, sort: 0,
    setupInfo: "{}", resourceLimits: "{}"
  });
  formError.value = "";
  formOk.value = "";
}

function openCreate() {
  editingId.value = null;
  resetForm();
  showForm.value = true;
}
function openEdit(p: AdminPackage) {
  editingId.value = p.id;
  Object.assign(form, {
    name: p.name, slug: p.slug, description: p.description, priceFen: p.priceFen,
    hours: p.hours, mcsmCategoryId: p.mcsmCategoryId, nodeStrategy: (p.nodeStrategy as "auto" | "fixed") || "auto",
    fixedNodeId: p.fixedNodeId || "", active: p.active, sort: p.sort,
    setupInfo: p.setupInfo, resourceLimits: p.resourceLimits || "{}"
  });
  formError.value = "";
  formOk.value = "";
  showForm.value = true;
}

async function openTemplates() {
  showTemplates.value = true;
  templateError.value = "";
  templateKeyword.value = "";
  if (templatesLoaded.value) return;
  templatesLoading.value = true;
  try {
    const res = await apiGet<{ templates: QuickTemplate[] }>("/admin/templates", { admin: true });
    templates.value = res.templates ?? [];
    templatesLoaded.value = true;
  } catch (e) {
    templateError.value = e instanceof Error ? e.message : t("admin_tpl_err");
  } finally {
    templatesLoading.value = false;
  }
}

function applyTemplate(tpl: QuickTemplate) {
  form.setupInfo = JSON.stringify(tpl.setupInfo, null, 2);
  formError.value = "";
  formOk.value = t("admin_tpl_applied", { name: tpl.title });
  showTemplates.value = false;
}

async function save() {
  formError.value = "";
  formOk.value = "";
  let setup: unknown;
  let limits: unknown;
  try {
    setup = JSON.parse(form.setupInfo);
  } catch {
    formError.value = t("admin_err_setup_json");
    return;
  }
  try {
    limits = JSON.parse(form.resourceLimits || "{}");
  } catch {
    formError.value = t("admin_err_limits_json");
    return;
  }
  const body = {
    slug: form.slug.trim(),
    name: form.name.trim(),
    description: form.description,
    priceFen: Number(form.priceFen),
    hours: Number(form.hours),
    mcsmCategoryId: Number(form.mcsmCategoryId),
    nodeStrategy: form.nodeStrategy,
    fixedNodeId: form.nodeStrategy === "fixed" ? form.fixedNodeId : "",
    active: form.active,
    sort: Number(form.sort) || 0,
    setupInfo: JSON.stringify(setup),
    resourceLimits: JSON.stringify(limits)
  };
  try {
    if (editingId.value) {
      await apiPut(`/admin/packages/${editingId.value}`, body, { admin: true });
    } else {
      await apiPost("/admin/packages", body, { admin: true });
    }
    showForm.value = false;
    await load();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : t("err_generic");
  }
}

async function remove(p: AdminPackage) {
  if (!confirm(`${t("admin_confirm_delete")} ${p.name}?`)) return;
  await apiDel(`/admin/packages/${p.id}`, { admin: true });
  await load();
}

onMounted(load);
</script>

<template>
  <div class="panel wide">
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button class="btn sm" @click="openCreate">{{ t("admin_create") }}</button>
    </div>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="packages.length === 0" class="muted center" style="padding:20px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("admin_field_name") }}</th><th>{{ t("admin_field_price") }}</th>
          <th>{{ t("admin_field_hours") }}</th><th>{{ t("admin_field_category") }}</th><th>{{ t("admin_field_strategy") }}</th>
          <th>{{ t("admin_field_active") }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in packages" :key="p.id">
          <td>{{ p.name }}<div class="muted" style="font-size:12px">{{ p.slug }}</div></td>
          <td>￥{{ priceYuan(p.priceFen) }}</td>
          <td>{{ daysText(p.hours) }}</td>
          <td>{{ p.mcsmCategoryId }}</td>
          <td>{{ p.nodeStrategy === "fixed" ? t("admin_strategy_fixed") : t("admin_strategy_auto") }}</td>
          <td><span class="badge" :class="p.active ? 'run' : 'stop'">{{ p.active ? t("admin_status_on") : t("admin_status_off") }}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn sm ghost" @click="openEdit(p)">{{ t("admin_edit") }}</button>
              <button class="btn sm ghost" style="color:var(--err)" @click="remove(p)">{{ t("admin_delete") }}</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showForm" class="modal-mask" @click.self="showForm = false">
      <div class="modal">
        <h3 style="margin-top:0">{{ editingId ? t("admin_edit") : t("admin_create") }}</h3>
        <div class="form-grid">
          <div class="field"><label>{{ t("admin_field_name") }}</label><input v-model="form.name" /></div>
          <div class="field"><label>{{ t("admin_field_slug") }}</label><input v-model="form.slug" /></div>
          <div class="field"><label>{{ t("admin_field_desc") }}</label><input v-model="form.description" /></div>
          <div class="field"><label>{{ t("admin_field_price") }}</label><input v-model.number="form.priceFen" type="number" /></div>
          <div class="field"><label>{{ t("admin_field_hours") }}</label><input v-model.number="form.hours" type="number" /></div>
          <div class="field"><label>{{ t("admin_field_category") }}</label><input v-model.number="form.mcsmCategoryId" type="number" /></div>
          <div class="field">
            <label>{{ t("admin_field_strategy") }}</label>
            <select v-model="form.nodeStrategy">
              <option value="auto">{{ t("admin_strategy_auto") }}</option>
              <option value="fixed">{{ t("admin_strategy_fixed") }}</option>
            </select>
          </div>
          <div class="field" v-if="form.nodeStrategy === 'fixed'">
            <label>{{ t("admin_field_node") }}</label>
            <select v-model="form.fixedNodeId">
              <option value="">{{ t("admin_tpl_select_node") }}</option>
              <option v-for="n in nodes" :key="n.uuid" :value="n.uuid">{{ n.remarks || n.ip }} ({{ n.ip }})</option>
            </select>
          </div>
          <div class="field"><label>{{ t("admin_field_sort") }}</label><input v-model.number="form.sort" type="number" /></div>
          <div class="field"><label>{{ t("admin_field_active") }}</label>
            <label style="font-weight:400"><input type="checkbox" v-model="form.active" style="width:auto" /> {{ t("admin_status_on") }}</label>
          </div>
        </div>
        <div class="field">
          <label class="tpl-label-row">
            <span>{{ t("admin_field_setup") }}</span>
            <button type="button" class="btn sm ghost tpl-import-btn" @click="openTemplates">{{ t("admin_tpl_btn") }}</button>
          </label>
          <textarea v-model="form.setupInfo" rows="8" class="code"></textarea>
        </div>
        <div class="field">
          <label>{{ t("admin_field_limits") }}</label>
          <textarea v-model="form.resourceLimits" rows="4" class="code"></textarea>
        </div>
        <div v-if="formOk" class="alert ok">{{ formOk }}</div>
        <div v-if="formError" class="alert err">{{ formError }}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn ghost" @click="showForm = false">{{ t("admin_cancel") }}</button>
          <button class="btn" @click="save">{{ t("admin_save") }}</button>
        </div>
      </div>
    </div>

    <div v-if="showTemplates" class="modal-mask" @click.self="showTemplates = false">
      <div class="modal tpl-modal">
        <h3 style="margin-top:0">{{ t("admin_tpl_title") }}</h3>
        <input v-model="templateKeyword" class="tpl-search" :placeholder="t('admin_tpl_search')" />
        <div v-if="templatesLoading" class="muted center tpl-status">{{ t("admin_tpl_loading") }}</div>
        <div v-else-if="templateError" class="alert err">{{ templateError }}</div>
        <div v-else-if="filteredTemplates.length === 0" class="muted center tpl-status">{{ t("admin_tpl_empty") }}</div>
        <div v-else class="tpl-list">
          <div v-for="(tpl, idx) in filteredTemplates" :key="`${tpl.title}-${tpl.gameType}-${idx}`" class="tpl-item">
            <div class="tpl-info">
              <div class="tpl-title">
                {{ tpl.title }}
                <span v-if="tpl.gameType" class="tpl-badge">{{ tpl.gameType }}</span>
                <span v-if="tpl.platform" class="tpl-badge alt">{{ tpl.platform }}</span>
              </div>
              <div v-if="tpl.description" class="tpl-desc">{{ tpl.description }}</div>
              <div v-if="tpl.author" class="tpl-author">{{ t("admin_tpl_author") }}：{{ tpl.author }}</div>
            </div>
            <button class="btn sm" @click="applyTemplate(tpl)">{{ t("admin_tpl_import") }}</button>
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:14px">
          <button class="btn ghost" @click="showTemplates = false">{{ t("admin_cancel") }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tpl-label-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.tpl-import-btn { white-space: nowrap; }
.tpl-modal { max-width: 780px; }
.tpl-search {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border);
  border-radius: 10px; font-size: 14px; margin-bottom: 12px;
}
.tpl-search:focus { outline: 2px solid var(--primary); border-color: var(--primary); }
.tpl-status { padding: 28px 0; }
.tpl-list {
  max-height: 52vh; overflow-y: auto; border: 1px solid var(--border); border-radius: 12px;
}
.tpl-item {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  border-bottom: 1px solid var(--border);
}
.tpl-item:last-child { border-bottom: none; }
.tpl-item:hover { background: rgba(255,255,255,0.03); }
.tpl-info { flex: 1; min-width: 0; }
.tpl-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tpl-desc {
  font-size: 12.5px; color: var(--muted); margin-top: 3px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.tpl-author { font-size: 11.5px; color: var(--muted); margin-top: 4px; }
.tpl-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px;
  background: var(--primary-dim); color: var(--primary); border: 1px solid rgba(52,211,153,0.25);
}
.tpl-badge.alt { background: rgba(255,255,255,0.06); color: var(--muted); border-color: var(--border); }
</style>

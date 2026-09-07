<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { apiGet, apiPost, apiPut, apiDel } from "../../api/client";
import type { Announcement } from "../../api/adminTypes";
import { t } from "../../i18n";

const list = ref<Announcement[]>([]);
const loading = ref(true);
const showForm = ref(false);
const editingId = ref<number | null>(null);
const busy = ref(false);
const formError = ref("");

interface AnnForm {
  title: string;
  content: string;
  level: "info" | "warn" | "critical";
  active: boolean;
  startAt: string;
  endAt: string;
}

const form = reactive<AnnForm>({
  title: "",
  content: "",
  level: "info",
  active: true,
  startAt: "",
  endAt: ""
});

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function load() {
  loading.value = true;
  try {
    const res = await apiGet<{ announcements: Announcement[] }>("/admin/announcements", { admin: true });
    list.value = res.announcements;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function resetForm() {
  form.title = "";
  form.content = "";
  form.level = "info";
  form.active = true;
  form.startAt = "";
  form.endAt = "";
  editingId.value = null;
  formError.value = "";
}

function openCreate() {
  resetForm();
  showForm.value = true;
}

function openEdit(a: Announcement) {
  resetForm();
  editingId.value = a.id;
  form.title = a.title;
  form.content = a.content;
  form.level = a.level;
  form.active = a.active;
  form.startAt = toLocalInput(a.startAt);
  form.endAt = toLocalInput(a.endAt);
  showForm.value = true;
}

async function save() {
  formError.value = "";
  if (!form.content.trim()) {
    formError.value = t("ann_err_content");
    return;
  }
  const payload = {
    title: form.title.trim(),
    content: form.content.trim(),
    level: form.level,
    active: form.active,
    startAt: form.startAt || null,
    endAt: form.endAt || null
  };
  busy.value = true;
  try {
    if (editingId.value) {
      await apiPut(`/admin/announcements/${editingId.value}`, payload, { admin: true });
    } else {
      await apiPost("/admin/announcements", payload, { admin: true });
    }
    showForm.value = false;
    await load();
  } catch (e) {
    formError.value = e instanceof Error ? e.message : t("err_generic");
  } finally {
    busy.value = false;
  }
}

async function remove(a: Announcement) {
  if (!window.confirm(t("ann_confirm_delete"))) return;
  await apiDel(`/admin/announcements/${a.id}`, { admin: true });
  await load();
}

function windowText(a: Announcement): string {
  if (!a.startAt && !a.endAt) return t("ann_window_always");
  const s = a.startAt ? new Date(a.startAt).toLocaleString() : "…";
  const e = a.endAt ? new Date(a.endAt).toLocaleString() : "…";
  return `${s} ~ ${e}`;
}

const levelLabel: Record<Announcement["level"], string> = {
  info: t("ann_level_info"),
  warn: t("ann_level_warn"),
  critical: t("ann_level_critical")
};
const levelBadge: Record<Announcement["level"], string> = {
  info: "run",
  warn: "warn",
  critical: "exp"
};
</script>

<template>
  <div class="panel wide">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h2 style="margin:0">{{ t("admin_tab_announce") }}</h2>
      <button class="btn sm" @click="openCreate">+ {{ t("ann_new") }}</button>
    </div>

    <form v-if="showForm" class="ann-form" @submit.prevent="save">
      <h3 style="margin:0 0 10px">{{ editingId ? t("ann_edit") : t("ann_new") }}</h3>
      <div class="field">
        <label>{{ t("ann_title") }}</label>
        <input v-model="form.title" :placeholder="t('ann_title_placeholder')" />
      </div>
      <div class="field">
        <label>{{ t("ann_content") }}</label>
        <textarea v-model="form.content" rows="3"></textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label>{{ t("ann_level") }}</label>
          <select v-model="form.level">
            <option value="info">{{ t("ann_level_info") }}</option>
            <option value="warn">{{ t("ann_level_warn") }}</option>
            <option value="critical">{{ t("ann_level_critical") }}</option>
          </select>
        </div>
        <div class="field">
          <label>{{ t("ann_start") }}</label>
          <input v-model="form.startAt" type="datetime-local" />
        </div>
        <div class="field">
          <label>{{ t("ann_end") }}</label>
          <input v-model="form.endAt" type="datetime-local" />
        </div>
      </div>
      <label class="field-check">
        <input v-model="form.active" type="checkbox" /> {{ t("ann_active") }}
      </label>
      <div v-if="formError" class="alert err">{{ formError }}</div>
      <div style="display:flex;gap:8px">
        <button class="btn sm" type="submit" :disabled="busy">{{ busy ? t("ann_saving") : t("ann_save") }}</button>
        <button class="btn sm ghost" type="button" @click="showForm = false">{{ t("ann_cancel") }}</button>
      </div>
    </form>

    <div v-if="loading" class="muted">{{ t("loading") }}</div>
    <div v-else-if="list.length === 0" class="muted center" style="padding:24px">{{ t("admin_empty") }}</div>
    <table v-else>
      <thead>
        <tr>
          <th>{{ t("ann_col_content") }}</th>
          <th>{{ t("ann_col_level") }}</th>
          <th>{{ t("ann_col_status") }}</th>
          <th>{{ t("ann_col_window") }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="a in list" :key="a.id">
          <td>
            <div v-if="a.title" style="font-weight:600">{{ a.title }}</div>
            <div style="white-space:pre-wrap;max-width:420px">{{ a.content }}</div>
          </td>
          <td><span class="badge" :class="levelBadge[a.level]">{{ levelLabel[a.level] }}</span></td>
          <td>
            <span class="badge" :class="a.active ? 'run' : 'stop'">
              {{ a.active ? t("ann_status_on") : t("ann_status_off") }}
            </span>
          </td>
          <td style="font-size:12px">{{ windowText(a) }}</td>
          <td style="white-space:nowrap">
            <button class="btn sm ghost" @click="openEdit(a)">{{ t("admin_edit") }}</button>
            <button class="btn sm ghost" @click="remove(a)">{{ t("ann_delete") }}</button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ann-form {
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
  background: rgba(0, 0, 0, 0.02);
}
.field-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.field-row .field {
  flex: 1;
  min-width: 160px;
}
.field-check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { apiGet } from "../api/client";
import type { Package } from "../api/types";
import { useAuthStore } from "../stores/auth";
import { t } from "../i18n";
import { priceYuan, daysText } from "../utils/format";

const packages = ref<Package[]>([]);
const loading = ref(true);
const auth = useAuthStore();
const router = useRouter();

const features = [
  { ico: "⚡", t: t("feature_1_t"), d: t("feature_1_d") },
  { ico: "🖥️", t: t("feature_2_t"), d: t("feature_2_d") },
  { ico: "🎮", t: t("feature_3_t"), d: t("feature_3_d") },
  { ico: "🔁", t: t("feature_4_t"), d: t("feature_4_d") }
];
const steps = [
  { t: t("step_buy_1"), d: t("step_buy_1_d") },
  { t: t("step_buy_2"), d: t("step_buy_2_d") },
  { t: t("step_buy_3"), d: t("step_buy_3_d") }
];

onMounted(async () => {
  try {
    const res = await apiGet<{ packages: Package[] }>("/packages");
    packages.value = res.packages;
  } finally {
    loading.value = false;
  }
});

function buy(): void {
  router.push(auth.isLoggedIn ? "/open" : "/login?redirect=/open");
}
</script>

<template>
  <section class="hero">
    <div class="container">
      <h1>{{ t("hero_title") }}</h1>
      <p>{{ t("hero_sub") }}</p>
      <div class="actions">
        <button class="btn" @click="buy">{{ t("hero_cta") }}</button>
        <a class="btn ghost" href="#packages">{{ t("hero_view") }}</a>
      </div>
    </div>
  </section>

  <section class="section features">
    <div class="container">
      <h2>{{ t("features_title") }}</h2>
      <div class="feature-grid">
        <div class="feature" v-for="(f, i) in features" :key="i">
          <div class="ico">{{ f.ico }}</div>
          <h3>{{ f.t }}</h3>
          <p>{{ f.d }}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="packages">
    <div class="container">
      <h2>{{ t("packages_title") }}</h2>
      <div v-if="loading" class="muted">{{ t("loading") }}</div>
      <div class="grid">
        <div class="card relative" v-for="(p, i) in packages" :key="p.id">
          <span v-if="i === 0" class="hot-badge">{{ t("package_hot") }}</span>
          <h3>{{ p.name }}</h3>
          <div class="desc">{{ p.description }}</div>
          <div class="chips">
            <span class="chip">{{ t("package_duration", { days: daysText(p.hours) }) }}</span>
          </div>
          <div class="price">
            {{ t("package_price") }}{{ priceYuan(p.priceFen) }}
          </div>
          <button class="btn" @click="buy">{{ t("package_buy") }}</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section features">
    <div class="container">
      <h2>{{ t("steps_title") }}</h2>
      <div class="steps-grid">
        <div class="step" v-for="(s, i) in steps" :key="i">
          <div class="num">{{ i + 1 }}</div>
          <h3>{{ s.t }}</h3>
          <p>{{ s.d }}</p>
        </div>
      </div>
    </div>
  </section>

  <footer class="footer">{{ t("footer") }}</footer>
</template>

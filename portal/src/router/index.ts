import { createRouter, createWebHistory } from "vue-router";
import { getToken, getAdminToken } from "../api/client";
import Home from "../pages/Home.vue";
import Login from "../pages/Login.vue";
import Reset from "../pages/Reset.vue";
import OpenServer from "../pages/OpenServer.vue";
import Services from "../pages/Services.vue";
import Account from "../pages/Account.vue";
import AdminLogin from "../pages/admin/AdminLogin.vue";
import AdminDashboard from "../pages/admin/AdminDashboard.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: Home },
    { path: "/login", component: Login },
    { path: "/reset", component: Reset },
    { path: "/open", component: OpenServer, meta: { requiresAuth: true } },
    { path: "/services", component: Services, meta: { requiresAuth: true } },
    { path: "/account", component: Account, meta: { requiresAuth: true } },
    { path: "/console/login", component: AdminLogin },
    { path: "/console", component: AdminDashboard, meta: { requiresAdmin: true } }
  ]
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !getToken()) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  if (to.meta.requiresAdmin && !getAdminToken()) {
    return { path: "/console/login" };
  }
  return true;
});

export default router;

import { defineStore } from "pinia";
import { apiPost, setAdminToken, getAdminToken } from "../api/client";

interface AdminState {
  token: string;
  username: string;
}

export const useAdminStore = defineStore("admin", {
  state: (): AdminState => ({
    token: getAdminToken(),
    username: localStorage.getItem("gw_admin_username") || ""
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token)
  },
  actions: {
    async login(username: string, password: string) {
      const res = await apiPost<{ token: string }>(
        "/admin/login",
        { username, password },
        { admin: false }
      );
      this.token = res.token;
      this.username = username;
      setAdminToken(res.token);
      localStorage.setItem("gw_admin_username", username);
    },
    logout() {
      this.token = "";
      this.username = "";
      setAdminToken("");
      localStorage.removeItem("gw_admin_username");
    }
  }
});

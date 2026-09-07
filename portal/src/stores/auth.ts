import { defineStore } from "pinia";
import { apiPost, setToken, getToken } from "../api/client";

interface AuthState {
  token: string;
  username: string;
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    token: getToken(),
    username: localStorage.getItem("gw_username") || ""
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token)
  },
  actions: {
    async login(username: string, password: string) {
      const res = await apiPost<{ token: string; username: string }>("/auth/login", {
        username,
        password
      });
      this.token = res.token;
      this.username = res.username;
      setToken(res.token);
      localStorage.setItem("gw_username", res.username);
    },
    async register(username: string, password: string, email: string) {
      await apiPost<{ username: string }>("/auth/register", { username, password, email });
      await this.login(username, password);
    },
    async forgotPassword(account: string) {
      await apiPost<{ ok: true }>("/auth/forgot", { account });
    },
    async resetPassword(token: string, newPassword: string) {
      await apiPost<{ ok: true }>("/auth/reset", { token, newPassword });
    },
    logout() {
      this.token = "";
      this.username = "";
      setToken("");
      localStorage.removeItem("gw_username");
    }
  }
});

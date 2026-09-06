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
    async register(username: string, password: string) {
      await apiPost<{ username: string }>("/auth/register", { username, password });
      await this.login(username, password);
    },
    logout() {
      this.token = "";
      this.username = "";
      setToken("");
      localStorage.removeItem("gw_username");
    }
  }
});

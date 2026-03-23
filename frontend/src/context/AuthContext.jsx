import { createContext, useContext, useState, useEffect } from "react";
import { apiLogin, apiRegister, apiGetMe } from "../api/auth.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      apiGetMe()
        .then((u) => setUser(u))
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    localStorage.setItem("token", data.access_token);
    setUser(data.user);
  };

  const register = async (email, username, password) => {
    const data = await apiRegister(email, username, password);
    localStorage.setItem("token", data.access_token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

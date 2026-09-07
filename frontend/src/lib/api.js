import axios from "axios";

export const BACKEND = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND}/api`;

export const cc = axios.create({ baseURL: API });
cc.interceptors.request.use((c) => {
  const t = localStorage.getItem("bf_token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export const fx = axios.create({ baseURL: API });
fx.interceptors.request.use((c) => {
  const t = localStorage.getItem("bf_field_token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

export const money = (c) => `$${((c || 0) / 100).toLocaleString("en-AU", { minimumFractionDigits: 2 })}`;
export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join(" ");
  return e?.message || "Something went wrong";
};

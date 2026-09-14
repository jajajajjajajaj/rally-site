import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(URL && KEY);
const sb = configured ? createClient(URL, KEY) : null;

// ---- 공용 ----
export async function getSeason(server) {
  const { data, error } = await sb.from("settings").select("value").eq("key", "current_season:" + server).maybeSingle();
  if (error) throw error;
  return data ? Number(data.value) : 1;
}

// ---- 사용자 ----
export async function submit(rec) {
  const { error } = await sb.rpc("submit_entry", { p: rec });
  if (error) throw error;
}

export async function getPublishedAssignment(server, season) {
  const { data, error } = await sb.from("assignments").select("leaders,groups,reqs,published")
    .eq("server", server).eq("season", season).maybeSingle();
  if (error) throw error;
  return data; // RLS 때문에 비공개면 null
}

// ---- 관리자 (Edge Function) ----
export async function admin(code, action, payload = {}) {
  const { data, error } = await sb.functions.invoke("admin", { body: { code, action, payload } });
  if (error) {
    // 401이면 코드 오류
    let msg = error.message || "요청 실패";
    try { const j = await error.context?.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

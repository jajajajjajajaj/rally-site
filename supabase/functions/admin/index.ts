// Edge Function: admin
// 관리자 코드를 서버에서 검증하고, 통과한 경우에만 제출 목록 조회/배정 편집을 수행합니다.
// Secrets: ADMIN_CODE (직접 추가), SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (자동 제공)

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad request" }, 400); }

  const { code, action, payload = {} } = body;
  if (!code || code !== Deno.env.get("ADMIN_CODE")) return json({ error: "invalid code" }, 401);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    switch (action) {
      case "login":
        return json({ ok: true });

      case "list_submissions": {
        const { data, error } = await db.from("submissions").select("*").eq("season", payload.season);
        if (error) throw error;
        return json({ data });
      }

      case "delete_submission": {
        const { error } = await db.from("submissions").delete()
          .eq("season", payload.season).eq("name", payload.name);
        if (error) throw error;
        return json({ ok: true });
      }

      case "get_assignment": {
        const { data, error } = await db.from("assignments").select("*").eq("season", payload.season).maybeSingle();
        if (error) throw error;
        return json({ data });
      }

      case "save_assignment": {
        const { season, leaders, reqs, groups, unassigned, published } = payload;
        const { error } = await db.from("assignments")
          .upsert({ season, leaders, reqs, groups, unassigned, published }, { onConflict: "season" });
        if (error) throw error;
        return json({ ok: true });
      }

      case "new_season": {
        const { data: cur, error: e1 } = await db.from("settings").select("value").eq("key", "current_season").single();
        if (e1) throw e1;
        const next = Number(cur.value) + 1;
        const { error: e2 } = await db.from("settings").update({ value: next }).eq("key", "current_season");
        if (e2) throw e2;
        return json({ season: next });
      }

      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: String((e as any)?.message ?? e) }, 500);
  }
});

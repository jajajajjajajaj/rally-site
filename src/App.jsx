import { useState, useEffect } from "react";
import * as api from "./api.js";
import { SLOTS, SLOT_VALUES, HEROES, HERO_VALUES, TROOPS, TG_LEVELS, T_LEVELS, RANK_VALUES, RALLY_SIZE, RIDER_RALLIES, RIDERS_PER_RALLY, totalScore, rallyScore, STR } from "./config.js";

// ===== 자동 배정 =====
// 1) 집결장과 겹치는 시간이 있는 사람 우선, 그 안에서 점수 높은 순
//    - 점수는 집결장이 고른 병종(reqs.troops[gi])만 합산. 안 고르면 전체 가중 점수
// 2) 집결마다 지정된 필수 영웅 5렙 보유자를 먼저 확보
// 3) 1번 집결부터 순서대로 8명씩
function autoAssign(subs, leaders, reqs) {
  const byName = Object.fromEntries(subs.map((s) => [s.name, s]));
  const leaderNames = new Set(leaders.filter(Boolean).map((l) => l.name));
  let pool = subs.filter((s) => !leaderNames.has(s.name));
  const groups = leaders.map(() => []);

  leaders.forEach((leader, gi) => {
    if (!leader) return;
    const lslots = new Set(byName[leader.name]?.slots || []);
    const overlaps = (s) => (lslots.size === 0 ? true : (s.slots || []).some((x) => lslots.has(x)));
    const score = (s) => rallyScore(s, reqs.troops?.[gi]);
    const order = (a, b) => (overlaps(b) - overlaps(a)) || (score(b) - score(a));
    pool.sort(order);

    const need = reqs[gi] || {};
    for (const hero of Object.keys(need)) {
      let n = need[hero];
      while (n > 0 && groups[gi].length < RALLY_SIZE) {
        const idx = pool.findIndex((s) => s.heroes?.[hero]);
        if (idx < 0) break;
        groups[gi].push(pool[idx].name); pool.splice(idx, 1); n--;
      }
    }
    while (groups[gi].length < RALLY_SIZE && pool.length) groups[gi].push(pool.shift().name);
  });
  pool.sort((a, b) => totalScore(b) - totalScore(a));
  return { groups, unassigned: pool.map((s) => s.name) };
}

// 필수 영웅 설정(reqs)을 바탕으로 집결별 탑승 영웅 자동 채우기 (1~RIDER_RALLIES번 집결, 집결당 RIDERS_PER_RALLY명)
function autoRiders(groups, reqs, byName) {
  const riders = {};
  for (let gi = 0; gi < RIDER_RALLIES; gi++) {
    const score = (s) => rallyScore(s, reqs.troops?.[gi]);
    const members = (groups[gi] || []).map((n) => byName[n]).filter(Boolean).sort((a, b) => score(b) - score(a));
    const used = new Set(); const list = [];
    for (const hero of Object.keys(reqs[gi] || {})) {
      let n = reqs[gi][hero];
      for (const m of members) {
        if (n <= 0 || list.length >= RIDERS_PER_RALLY) break;
        if (!used.has(m.name) && m.heroes?.[hero]) { list.push({ name: m.name, hero }); used.add(m.name); n--; }
      }
    }
    riders[gi] = list;
  }
  return riders;
}

// ===== 조각 =====
function Pills({ options, value, onChange, multi, xs, label }) {
  const isOn = (o) => (multi ? value.includes(o) : value === o);
  const toggle = (o) => multi ? onChange(isOn(o) ? value.filter((v) => v !== o) : [...value, o]) : onChange(o);
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o} type="button" className={`pill ${isOn(o) ? "on" : ""} ${xs ? "xs" : ""}`} onClick={() => toggle(o)}>{label ? label(o) : o}</button>
      ))}
    </div>
  );
}
// 표시용 라벨
const slotLabel = (v) => { const s = SLOTS.find((x) => x.value === v); return s ? `${s.kst} KST (${s.utc} UTC)` : v; };
const heroLabel = (lang) => (v) => { const h = HEROES.find((x) => x.value === v); return lang === "en" && h ? h.en : v; };
const troopLabel = (lang, tr) => (lang === "en" ? tr.en : tr.ko);
const rankLabel = (T) => (v) => (v === "그 외" ? T.other : v);
const Field = ({ label, hint, children }) => (
  <div className="field">
    {label && <div className="label">{label}</div>}
    {hint && <div className="hint">{hint}</div>}
    {children}
  </div>
);
const Btn = ({ children, onClick, kind = "primary", disabled, small }) => (
  <button type="button" className={`btn ${kind} ${small ? "small" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>
);

const emptyForm = () => ({
  name: "", slots: [], trial_rank: "",
  inf_tg: null, inf_t: null, arc_tg: null, arc_t: null, cav_tg: null, cav_t: null,
  heroes: Object.fromEntries(HERO_VALUES.map((h) => [h, false])),
});

// ===== 사용자: 제출 =====
function UserForm({ server, season, onDone, lang }) {
  const T = STR[lang];
  const [f, setF] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const missing = [];
  if (!f.name.trim()) missing.push(T.field.name);
  if (!f.slots.length) missing.push(T.field.slots);
  if (!f.trial_rank) missing.push(T.field.rank);
  TROOPS.forEach((t) => { if (!f[t.key + "_tg"] || !f[t.key + "_t"]) missing.push(T.field.level(troopLabel(lang, t))); });

  const doSubmit = async () => {
    setBusy(true); setErr("");
    const rec = { ...f, name: f.name.trim(), season, server };
    try { await api.submit(rec); onDone(rec); }
    catch (e) { setErr(T.saveFail + " (" + e.message + ")"); }
    setBusy(false);
  };

  return (
    <div>
      <Field label={T.name} hint={T.nameHint}>
        <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={T.nickname} />
      </Field>
      <Field label={T.slots} hint={T.slotsHint}>
        <Pills options={SLOT_VALUES} value={f.slots} onChange={(v) => set("slots", v)} multi label={slotLabel} />
      </Field>
      <Field label={T.rank}>
        <Pills options={RANK_VALUES} value={f.trial_rank} onChange={(v) => set("trial_rank", v)} label={rankLabel(T)} />
      </Field>
      {TROOPS.map((t) => (
        <div key={t.key} className="panel">
          <h3>{troopLabel(lang, t)}</h3>
          <div className="dim" style={{ marginBottom: 8 }}>{T.tg}</div>
          <Pills options={TG_LEVELS} value={f[t.key + "_tg"]} onChange={(v) => set(t.key + "_tg", v)} />
          <div className="dim mt" style={{ marginBottom: 8 }}>{T.t}</div>
          <Pills options={T_LEVELS} value={f[t.key + "_t"]} onChange={(v) => set(t.key + "_t", v)} />
        </div>
      ))}
      <Field label={T.heroes} hint={T.heroesHint}>
        <Pills options={HERO_VALUES} value={HERO_VALUES.filter((h) => f.heroes[h])} label={heroLabel(lang)}
          onChange={(v) => set("heroes", Object.fromEntries(HERO_VALUES.map((h) => [h, v.includes(h)])))} multi />
      </Field>
      {missing.length > 0 && <div className="dim" style={{ marginBottom: 12 }}>{T.missing}: {missing.join(", ")}</div>}
      {err && <div className="err">{err}</div>}
      <Btn onClick={doSubmit} disabled={busy || missing.length > 0}>{busy ? T.saving : T.submitBtn}</Btn>
    </div>
  );
}

// ===== 사용자: 결과 =====
function UserResult({ server, season, lang }) {
  const T = STR[lang];
  const [name, setName] = useState("");
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState("");
  const check = async () => {
    setMsg(""); setRes(null);
    const n = name.trim();
    let a = null;
    try { a = await api.getPublishedAssignment(server, season); } catch { return setMsg(T.loadFail); }
    if (!a) return setMsg(T.notPublished);
    const ridersOf = (gi) => a.reqs?.riders?.[gi] || [];
    const li = a.leaders.findIndex((l) => l && l.name === n);
    if (li >= 0) return setRes({ leader: true, rally: li + 1, members: a.groups[li], riders: ridersOf(li) });
    const gi = a.groups.findIndex((g) => g.includes(n));
    if (gi < 0) return setMsg(T.notFound);
    const riders = ridersOf(gi);
    setRes({ leader: false, rally: gi + 1, leaderName: a.leaders[gi]?.name, members: a.groups[gi], riders, myHero: riders.find((r) => r.name === n)?.hero });
  };
  return (
    <div>
      <Field label={T.nickname}><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} /></Field>
      <Btn onClick={check} disabled={!name.trim()}>{T.check}</Btn>
      {msg && <div className="dim mt">{msg}</div>}
      {res && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="accent" style={{ fontSize: 24, fontWeight: 700 }}>{T.rally(res.rally)}</div>
          <div className="mt">{res.leader ? T.youLead : `${T.leader}: ${res.leaderName}`}</div>
          {res.myHero && <div className="mt" style={{ fontWeight: 700, color: "var(--ok)" }}>{T.yourHero(heroLabel(lang)(res.myHero))}</div>}
          {res.riders.length > 0 && (
            <>
              <div className="dim mt">{T.riders}</div>
              <div>{res.riders.map((r) => `${r.name} — ${heroLabel(lang)(r.hero)}`).join(" · ")}</div>
            </>
          )}
          <div className="dim mt">{T.members}</div>
          <div>{res.members.join(", ") || T.none}</div>
        </div>
      )}
    </div>
  );
}

// ===== 관리자 =====
const EMPTY_ASSIGN = { leaders: Array(6).fill(null), reqs: {}, groups: Array(6).fill([]), unassigned: [], published: false };

function Admin({ code, server, owner, season, setSeason, logout }) {
  const [tab, setTab] = useState("list");
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assign, setAssign] = useState(EMPTY_ASSIGN);
  const [toast, setToast] = useState("");
  const [err, setErr] = useState("");
  const say = (t) => { setToast(t); setTimeout(() => setToast(""), 2500); };
  const call = async (action, payload) => {
    try { return await api.admin(code, action, payload); }
    catch (e) { setErr(e.message); if (/invalid code/.test(e.message)) logout(); throw e; }
  };

  const reload = async () => {
    setLoading(true); setErr("");
    try {
      const { data: list } = await call("list_submissions", { server, season });
      setSubs(list || []);
      const { data: a } = await call("get_assignment", { server, season });
      if (a) setAssign({ leaders: a.leaders, reqs: a.reqs, groups: a.groups, unassigned: a.unassigned, published: a.published });
      else {
        const leaders = Array(6).fill(null).map((_, i) => { const s = (list || []).find((x) => x.trial_rank === String(i + 1)); return s ? { name: s.name } : null; });
        setAssign({ ...EMPTY_ASSIGN, leaders });
      }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { reload(); }, [season]);

  const byName = Object.fromEntries(subs.map((s) => [s.name, s]));
  const save = async (next) => {
    setAssign(next);
    try { await call("save_assignment", { server, season, ...next }); say("저장했어요"); } catch {}
  };

  const riders = assign.reqs.riders || {};
  const setRiders = (gi, list) => save({ ...assign, reqs: { ...assign.reqs, riders: { ...riders, [gi]: list } } });
  // 집결별 병종 선택 {gi: ["inf","cav"]} — 바로 저장
  const troopsSel = assign.reqs.troops || {};
  const setTroops = (gi, keys) => save({ ...assign, reqs: { ...assign.reqs, troops: { ...troopsSel, [gi]: keys } } });
  const troopsLabel = (gi) => (troopsSel[gi]?.length ? troopsSel[gi].map((k) => TROOPS.find((t) => t.key === k)?.ko).join("+") : "전체(가중)");
  const setRider = (gi, i, patch) => {
    const list = [...(riders[gi] || [])];
    while (list.length <= i) list.push({ name: "", hero: "" });
    list[i] = { ...list[i], ...patch };
    setRiders(gi, list.filter((r, k) => k <= i || r.name || r.hero));
  };
  const runAuto = () => {
    const r = autoAssign(subs, assign.leaders, assign.reqs);
    const auto = autoRiders(r.groups, assign.reqs, byName);
    save({ ...assign, ...r, reqs: { ...assign.reqs, riders: auto } });
  };
  const moveMember = (name, toIdx) => {
    const groups = assign.groups.map((g) => g.filter((n) => n !== name));
    let unassigned = assign.unassigned.filter((n) => n !== name);
    if (toIdx === -1) unassigned = [...unassigned, name]; else groups[toIdx] = [...groups[toIdx], name];
    save({ ...assign, groups, unassigned });
  };
  const setLeader = (gi, name) => save({ ...assign, leaders: assign.leaders.map((l, i) => (i === gi ? (name ? { name } : null) : l)) });
  const setReq = (gi, hero, n) => {
    const cur = { ...(assign.reqs[gi] || {}) };
    if (n > 0) cur[hero] = n; else delete cur[hero];
    setAssign({ ...assign, reqs: { ...assign.reqs, [gi]: cur } });
  };
  const togglePublish = () => save({ ...assign, published: !assign.published });
  const removeSub = async (name) => {
    if (!confirm(`${name} 제출을 삭제할까요?`)) return;
    try { await call("delete_submission", { server, season, name }); reload(); } catch {}
  };
  const newSeason = async () => {
    if (!confirm(`${season + 1}회차를 시작할까요? 이전 회차 데이터는 그대로 보관돼요.`)) return;
    try { const r = await call("new_season", { server }); setSeason(r.season); } catch {}
  };

  const sorted = [...subs].sort((a, b) => totalScore(b) - totalScore(a));
  const troopStr = (s) => TROOPS.map((t) => `${t.ko} TG${s[t.key + "_tg"]}/T${s[t.key + "_t"]}`).join(" · ");
  const heroStr = (s) => HERO_VALUES.filter((h) => s.heroes?.[h]).join(",") || "-";

  return (
    <div>
      <div className="tabs">
        {[["list", `제출 ${subs.length}명`], ["assign", "배정"], ["settings", "설정"]].map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {toast && <div className="toast">{toast}</div>}
      {err && <div className="err">{err}</div>}
      {loading && <div className="dim">불러오는 중…</div>}

      {!loading && tab === "list" && (
        <div>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="dim">병력 점수 높은 순</span>
            <Btn small kind="ghost" onClick={reload}>새로고침</Btn>
          </div>
          {sorted.length === 0 && <div className="dim">아직 제출이 없어요.</div>}
          {sorted.map((s) => (
            <div key={s.name} className="card">
              <div className="row">
                <span className="name">{s.name} <span className="dim">시련 {s.trial_rank}</span></span>
                <span className="score">{totalScore(s)}</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{troopStr(s)}</div>
              <div className="dim" style={{ marginTop: 4 }}>시간 {s.slots.join(", ")} · 5렙 {heroStr(s)}</div>
              <div className="mt"><Btn small kind="danger" onClick={() => removeSub(s.name)}>삭제</Btn></div>
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "assign" && (
        <div>
          <div className="panel" style={{ border: `1px solid ${assign.published ? "var(--ok)" : "var(--line)"}` }}>
            <div className="row">
              <div>
                <div style={{ fontWeight: 700 }}>{assign.published ? "공개 중" : "비공개"}</div>
                <div className="dim">공개하면 사용자가 자기 배정을 확인할 수 있어요.</div>
              </div>
              <Btn small kind={assign.published ? "danger" : "primary"} onClick={togglePublish}>{assign.published ? "비공개로" : "공개하기"}</Btn>
            </div>
          </div>
          <Btn onClick={runAuto} disabled={!subs.length}>자동 배정 실행</Btn>
          <div className="dim" style={{ margin: "6px 0 16px" }}>1번 집결부터 강한 순서로 채워요. 집결마다 병종을 고르면 그 병종 점수만으로 순위를 매기고(안 고르면 전체 가중 점수), 집결장과 시간이 겹치는 사람을 먼저 넣고, 필수 영웅을 지정하면 그 영웅 5렙 보유자를 우선 확보해요. 회색 이름은 집결장과 겹치는 시간이 없는 사람이에요.</div>

          {assign.leaders.map((leader, gi) => {
            const lslots = new Set(byName[leader?.name]?.slots || []);
            return (
              <div key={gi} className="panel">
                <div className="row" style={{ marginBottom: 8 }}>
                  <span className="accent" style={{ fontSize: 18, fontWeight: 700, whiteSpace: "nowrap" }}>{gi + 1}번</span>
                  <select value={leader?.name || ""} onChange={(e) => setLeader(gi, e.target.value)} style={{ padding: "6px 8px", fontSize: 14 }}>
                    <option value="">집결장 없음</option>
                    {sorted.map((s) => <option key={s.name} value={s.name}>{s.name} (시련 {s.trial_rank}, {totalScore(s)}점)</option>)}
                  </select>
                </div>
                {leader && <div className="dim" style={{ marginBottom: 8 }}>집결장 시간 {[...lslots].join(", ") || "미입력"}</div>}
                <div className="dim" style={{ marginBottom: 6 }}>집결 병종 (고른 병종 점수로만 배정)</div>
                <Pills options={TROOPS.map((t) => t.key)} value={troopsSel[gi] || []} onChange={(v) => setTroops(gi, v)} multi xs
                  label={(k) => TROOPS.find((t) => t.key === k).ko} />
                <div style={{ marginBottom: 10 }} />
                <div className="dim" style={{ marginBottom: 6 }}>필수 영웅 (5렙 보유자 수)</div>
                <div className="pills" style={{ marginBottom: 10 }}>
                  {HERO_VALUES.map((h) => {
                    const n = assign.reqs[gi]?.[h] || 0;
                    return <button key={h} type="button" className={`pill xs ${n ? "on" : ""}`} onClick={() => setReq(gi, h, (n + 1) % 5)}>{h}{n ? ` ×${n}` : ""}</button>;
                  })}
                </div>
                {gi < RIDER_RALLIES && (
                  <div style={{ marginBottom: 10 }}>
                    <div className="row" style={{ marginBottom: 6 }}>
                      <span className="dim">영웅 탑승 지정 ({RIDERS_PER_RALLY}명)</span>
                      <Btn small kind="ghost" onClick={() => setRiders(gi, autoRiders(assign.groups, assign.reqs, byName)[gi])}>필수 영웅으로 자동</Btn>
                    </div>
                    {Array.from({ length: RIDERS_PER_RALLY }).map((_, i) => {
                      const r = riders[gi]?.[i] || { name: "", hero: "" };
                      const m = byName[r.name];
                      return (
                        <div key={i} className="row" style={{ marginBottom: 4 }}>
                          <select className="small" style={{ flex: 1 }} value={r.name} onChange={(e) => setRider(gi, i, { name: e.target.value })}>
                            <option value="">— 집결원 —</option>
                            {(assign.groups[gi] || []).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <select className="small" style={{ flex: 1 }} value={r.hero} onChange={(e) => setRider(gi, i, { hero: e.target.value })}>
                            <option value="">— 영웅 —</option>
                            {HERO_VALUES.map((h) => <option key={h} value={h}>{h}{m?.heroes?.[h] ? " ★" : ""}</option>)}
                          </select>
                        </div>
                      );
                    })}
                    <div className="dim" style={{ fontSize: 12 }}>★ = 그 사람이 5렙 보유한 영웅</div>
                  </div>
                )}
                <div className="dim">인원 {assign.groups[gi]?.length || 0}/{RALLY_SIZE} · 점수 기준 {troopsLabel(gi)}</div>
                {(assign.groups[gi] || []).map((n) => (
                  <MemberRow key={n} name={n} sub={byName[n]} current={gi} onMove={moveMember} score={(s) => rallyScore(s, troopsSel[gi])}
                    overlap={lslots.size === 0 || (byName[n]?.slots || []).some((x) => lslots.has(x))} />
                ))}
              </div>
            );
          })}
          <div className="panel">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>미배정 {assign.unassigned.length}명</div>
            {assign.unassigned.map((n) => <MemberRow key={n} name={n} sub={byName[n]} current={-1} onMove={moveMember} overlap />)}
          </div>
        </div>
      )}

      {!loading && tab === "settings" && (
        <div>
          <Field label="회차" hint={`${server} 서버 현재 ${season}회차. 새 회차를 시작하면 이 서버의 제출이 새로 모여요.`}>
            <Btn kind="ghost" onClick={newSeason}>{season + 1}회차 시작</Btn>
          </Field>
          {owner ? <OwnerPanel call={call} say={say} /> : <Field label="관리자 코드" hint="코드 변경은 총괄 관리자에게 요청하세요." />}
          <Field label="점수 기준" hint="병종 가중치 보병 3 · 궁병 2 · 기병 1 / 병종 점수 = TG×10 + (T−8)×3 (src/config.js에서 조정)" />
          <Btn kind="ghost" onClick={logout}>로그아웃</Btn>
        </div>
      )}
    </div>
  );
}

// ===== 총괄 관리자: 서버 관리 =====
function OwnerPanel({ call, say }) {
  const [list, setList] = useState([]);
  const [target, setTarget] = useState(""); const [code, setCode] = useState("");
  const [edit, setEdit] = useState({});   // {server: newCode}
  const load = async () => { try { const r = await call("list_servers", { server: "-" }); setList(r.data || []); } catch {} };
  useEffect(() => { load(); }, []);
  const add = async () => {
    try { await call("add_server", { server: "-", target: target.trim(), code: code.trim() }); setTarget(""); setCode(""); say("서버를 추가했어요"); load(); } catch {}
  };
  const setCodeFor = async (sv) => {
    const c = (edit[sv] || "").trim(); if (c.length < 4) return say("코드는 4자 이상");
    try { await call("set_code", { server: "-", target: sv, code: c }); setEdit({ ...edit, [sv]: "" }); say(`${sv} 서버 코드를 변경했어요`); } catch {}
  };
  const remove = async (sv) => {
    if (!confirm(`${sv} 서버를 목록에서 삭제할까요? (제출 데이터는 남습니다)`)) return;
    try { await call("delete_server", { server: "-", target: sv }); say("삭제했어요"); load(); } catch {}
  };
  return (
    <div className="panel" style={{ border: "1px solid var(--accent)" }}>
      <h3>총괄 관리자 · 서버 관리</h3>
      <div className="dim" style={{ marginBottom: 8 }}>서버 추가</div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input inputMode="numeric" placeholder="서버 번호" value={target} onChange={(e) => setTarget(e.target.value)} />
        <input type="password" placeholder="관리자 코드 (4자+)" value={code} onChange={(e) => setCode(e.target.value)} />
        <Btn small onClick={add} disabled={!target.trim() || code.trim().length < 4}>추가</Btn>
      </div>
      <div className="dim" style={{ marginBottom: 6 }}>등록된 서버 ({list.length})</div>
      {list.map((r) => (
        <div key={r.server} className="member" style={{ flexWrap: "wrap" }}>
          <div className="n" style={{ minWidth: 60 }}>{r.server}</div>
          <input type="password" placeholder="새 코드" value={edit[r.server] || ""} onChange={(e) => setEdit({ ...edit, [r.server]: e.target.value })} style={{ flex: 1, minWidth: 100, padding: "4px 8px", fontSize: 13 }} />
          <Btn small kind="ghost" onClick={() => setCodeFor(r.server)}>코드 변경</Btn>
          <Btn small kind="danger" onClick={() => remove(r.server)}>삭제</Btn>
        </div>
      ))}
      <div className="dim mt" style={{ fontSize: 12 }}>총괄 코드(OWNER_CODE)는 Supabase Secrets에서만 바꿀 수 있어요. 서버 관리자는 자기 코드를 바꿀 수 없습니다.</div>
    </div>
  );
}

function MemberRow({ name, sub, current, onMove, overlap, score = totalScore }) {
  return (
    <div className={`member ${overlap ? "" : "nooverlap"}`}>
      <div className="info">
        <div className="n">{name} <span className="accent">{sub ? score(sub) : "?"}</span></div>
        {sub && <div className="m">{sub.slots.join(",")} · {HERO_VALUES.filter((h) => sub.heroes?.[h]).join(",") || "-"}</div>}
      </div>
      <select className="small" value={current} onChange={(e) => onMove(name, Number(e.target.value))}>
        {[0, 1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i + 1}번</option>)}
        <option value={-1}>미배정</option>
      </select>
    </div>
  );
}

// ===== 앱 =====
export default function App() {
  const [server, setServer] = useState(() => localStorage.getItem("server") || "");
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || (navigator.language?.startsWith("ko") ? "ko" : "en"));
  const T = STR[lang];
  const toggleLang = () => { const l = lang === "ko" ? "en" : "ko"; localStorage.setItem("lang", l); setLang(l); };
  const [view, setView] = useState("home");
  const [season, setSeason] = useState(null);
  const [admin, setAdmin] = useState(() => { try { return JSON.parse(sessionStorage.getItem("admin")) || null; } catch { return null; } });
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [done, setDone] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const activeServer = server;

  useEffect(() => {
    if (!api.configured || !activeServer) return;
    setSeason(null);
    api.getSeason(activeServer).then(setSeason).catch((e) => setLoadErr(T.connFail + ": " + e.message));
  }, [activeServer]);

  const pickServer = (sv) => { localStorage.setItem("server", sv); setServer(sv); };
  const [servers, setServers] = useState(null);
  useEffect(() => {
    if (!api.configured) return;
    api.listServers().then((l) => { setServers(l); if (server && !l.includes(server)) { localStorage.removeItem("server"); setServer(""); } })
      .catch(() => setServers([]));
  }, []);
  const goHome = () => { setView("home"); setDone(null); };
  const logout = () => { sessionStorage.removeItem("admin"); setAdmin(null); setView("home"); };
  const tryLogin = async () => {
    setCodeErr("");
    try {
      const r = await api.admin(codeInput, "login", { server });
      const a = { code: codeInput, server, owner: r.owner };
      sessionStorage.setItem("admin", JSON.stringify(a)); setAdmin(a); setView("admin");
    } catch (e) { setCodeErr(/invalid code/.test(e.message) ? "코드가 맞지 않아요." : "확인 실패: " + e.message); }
  };

  if (!api.configured) return (
    <div className="wrap"><div className="err">{T.envMissing}</div></div>
  );

  return (
    <div className="wrap">
      <div className="top">
        <button className="title-btn" onClick={goHome}>
          <h1>{T.title}</h1>
          <div className="sub">{activeServer ? `${T.server} ${activeServer} · ${season ? T.season(season) : "…"}` : T.pickServer}</div>
        </button>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small kind="ghost" onClick={toggleLang}>{lang === "ko" ? "EN" : "한국어"}</Btn>
          {view !== "home" && <Btn small kind="ghost" onClick={goHome}>{T.home}</Btn>}
        </div>
      </div>
      {loadErr && <div className="err">{loadErr}</div>}

      {view === "home" && (
        <div className="stack">
          <Field label={T.myServer}>
            {servers === null ? <div className="dim">{T.loadingServers}</div>
              : servers.length === 0 ? <div className="dim">{T.noServers}</div>
              : <Pills options={servers} value={server} onChange={pickServer} />}
          </Field>
          <Btn onClick={() => setView("form")} disabled={!server || !season}>{T.submit}</Btn>
          <Btn kind="ghost" onClick={() => setView("result")} disabled={!server || !season}>{T.checkResult}</Btn>
          <div className="footer-link">
            <button onClick={() => server && setView(admin ? "admin" : "login")} disabled={!server} style={{ opacity: server ? 1 : 0.4 }}>{T.admin}</button>
          </div>
        </div>
      )}
      {view === "form" && !done && <UserForm server={server} season={season} onDone={setDone} lang={lang} />}
      {view === "form" && done && (
        <div className="panel">
          <div className="ok" style={{ fontSize: 20, fontWeight: 700 }}>{T.doneTitle}</div>
          <div className="mt">{T.done(done.name, server, season)}</div>
        </div>
      )}
      {view === "result" && <UserResult server={server} season={season} lang={lang} />}
      {view === "login" && (
        <div>
          <Field label={T.adminCode} hint={T.adminCodeHint}>
            <input type="password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryLogin()} />
          </Field>
          {codeErr && <div className="err">{codeErr}</div>}
          <Btn onClick={tryLogin} disabled={!codeInput}>{T.enter}</Btn>
        </div>
      )}
      {view === "admin" && admin && season && (
        <Admin code={admin.code} server={admin.server} owner={admin.owner} season={season} setSeason={setSeason} logout={logout} />
      )}
      <div className="made-by">made by 프랜시스베이컨 서버 추가문의 943 프랜시스 베이컨</div>
    </div>
  );
}

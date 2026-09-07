import { useState, useEffect } from "react";
import * as api from "./api.js";
import { SERVERS, SLOTS, HEROES, TROOPS, TG_LEVELS, T_LEVELS, RANKS, RALLY_SIZE, totalScore } from "./config.js";

// ===== 자동 배정 =====
// 1) 집결장과 겹치는 시간이 있는 사람 우선, 그 안에서 점수 높은 순
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
    const order = (a, b) => (overlaps(b) - overlaps(a)) || (totalScore(b) - totalScore(a));
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

// ===== 조각 =====
function Pills({ options, value, onChange, multi, xs }) {
  const isOn = (o) => (multi ? value.includes(o) : value === o);
  const toggle = (o) => multi ? onChange(isOn(o) ? value.filter((v) => v !== o) : [...value, o]) : onChange(o);
  return (
    <div className="pills">
      {options.map((o) => (
        <button key={o} type="button" className={`pill ${isOn(o) ? "on" : ""} ${xs ? "xs" : ""}`} onClick={() => toggle(o)}>{o}</button>
      ))}
    </div>
  );
}
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
  heroes: Object.fromEntries(HEROES.map((h) => [h, false])),
});

// ===== 사용자: 제출 =====
function UserForm({ server, season, onDone }) {
  const [f, setF] = useState(emptyForm());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const missing = [];
  if (!f.name.trim()) missing.push("이름");
  if (!f.slots.length) missing.push("가능 시간");
  if (!f.trial_rank) missing.push("시련 순위");
  TROOPS.forEach((t) => { if (!f[t.key + "_tg"] || !f[t.key + "_t"]) missing.push(`${t.label} 레벨`); });

  const doSubmit = async () => {
    setBusy(true); setErr("");
    const rec = { ...f, name: f.name.trim(), season, server };
    try { await api.submit(rec); onDone(rec); }
    catch (e) { setErr("저장에 실패했어요. 잠시 후 다시 시도해 주세요. (" + e.message + ")"); }
    setBusy(false);
  };

  return (
    <div>
      <Field label="이름 (게임 닉네임)" hint="같은 이름으로 다시 제출하면 이전 내용이 덮어써져요.">
        <input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="닉네임" />
      </Field>
      <Field label="참여 가능한 시간 (한국시간)" hint="가능한 시간을 모두 선택">
        <Pills options={SLOTS} value={f.slots} onChange={(v) => set("slots", v)} multi />
      </Field>
      <Field label="서버 내 시련 순위">
        <Pills options={RANKS} value={f.trial_rank} onChange={(v) => set("trial_rank", v)} />
      </Field>
      {TROOPS.map((t) => (
        <div key={t.key} className="panel">
          <h3>{t.label}</h3>
          <div className="dim" style={{ marginBottom: 8 }}>TG 레벨</div>
          <Pills options={TG_LEVELS} value={f[t.key + "_tg"]} onChange={(v) => set(t.key + "_tg", v)} />
          <div className="dim mt" style={{ marginBottom: 8 }}>T 레벨</div>
          <Pills options={T_LEVELS} value={f[t.key + "_t"]} onChange={(v) => set(t.key + "_t", v)} />
        </div>
      ))}
      <Field label="스킬 5렙 영웅" hint="5렙인 영웅만 선택">
        <Pills options={HEROES} value={HEROES.filter((h) => f.heroes[h])}
          onChange={(v) => set("heroes", Object.fromEntries(HEROES.map((h) => [h, v.includes(h)])))} multi />
      </Field>
      {missing.length > 0 && <div className="dim" style={{ marginBottom: 12 }}>아직 입력 안 한 항목: {missing.join(", ")}</div>}
      {err && <div className="err">{err}</div>}
      <Btn onClick={doSubmit} disabled={busy || missing.length > 0}>{busy ? "저장 중…" : "제출하기"}</Btn>
    </div>
  );
}

// ===== 사용자: 결과 =====
function UserResult({ server, season }) {
  const [name, setName] = useState("");
  const [res, setRes] = useState(null);
  const [msg, setMsg] = useState("");
  const check = async () => {
    setMsg(""); setRes(null);
    const n = name.trim();
    let a = null;
    try { a = await api.getPublishedAssignment(server, season); } catch { return setMsg("불러오지 못했어요. 다시 시도해 주세요."); }
    if (!a) return setMsg("아직 배정 결과가 공개되지 않았어요.");
    const li = a.leaders.findIndex((l) => l && l.name === n);
    if (li >= 0) return setRes({ leader: true, rally: li + 1, members: a.groups[li] });
    const gi = a.groups.findIndex((g) => g.includes(n));
    if (gi < 0) return setMsg("배정 명단에 이름이 없어요. 닉네임을 확인해 주세요.");
    setRes({ leader: false, rally: gi + 1, leaderName: a.leaders[gi]?.name, members: a.groups[gi] });
  };
  return (
    <div>
      <Field label="닉네임"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && check()} /></Field>
      <Btn onClick={check} disabled={!name.trim()}>결과 확인</Btn>
      {msg && <div className="dim mt">{msg}</div>}
      {res && (
        <div className="panel" style={{ marginTop: 20 }}>
          <div className="accent" style={{ fontSize: 24, fontWeight: 700 }}>{res.rally}번 집결</div>
          <div className="mt">{res.leader ? "당신이 집결장입니다." : `집결장: ${res.leaderName}`}</div>
          <div className="dim mt">참여 인원</div>
          <div>{res.members.join(", ") || "없음"}</div>
        </div>
      )}
    </div>
  );
}

// ===== 관리자 =====
const EMPTY_ASSIGN = { leaders: Array(6).fill(null), reqs: {}, groups: Array(6).fill([]), unassigned: [], published: false };

function Admin({ code, server, season, setSeason, logout }) {
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

  const runAuto = () => save({ ...assign, ...autoAssign(subs, assign.leaders, assign.reqs) });
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
  const troopStr = (s) => TROOPS.map((t) => `${t.label} TG${s[t.key + "_tg"]}/T${s[t.key + "_t"]}`).join(" · ");
  const heroStr = (s) => HEROES.filter((h) => s.heroes?.[h]).join(",") || "-";

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
          <div className="dim" style={{ margin: "6px 0 16px" }}>1번 집결부터 강한 순서로 채워요. 집결장과 시간이 겹치는 사람을 먼저 넣고, 필수 영웅을 지정하면 그 영웅 5렙 보유자를 우선 확보해요. 회색 이름은 집결장과 겹치는 시간이 없는 사람이에요.</div>

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
                <div className="dim" style={{ marginBottom: 6 }}>필수 영웅 (5렙 보유자 수)</div>
                <div className="pills" style={{ marginBottom: 10 }}>
                  {HEROES.map((h) => {
                    const n = assign.reqs[gi]?.[h] || 0;
                    return <button key={h} type="button" className={`pill xs ${n ? "on" : ""}`} onClick={() => setReq(gi, h, (n + 1) % 5)}>{h}{n ? ` ×${n}` : ""}</button>;
                  })}
                </div>
                <div className="dim">인원 {assign.groups[gi]?.length || 0}/{RALLY_SIZE}</div>
                {(assign.groups[gi] || []).map((n) => (
                  <MemberRow key={n} name={n} sub={byName[n]} current={gi} onMove={moveMember}
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
          <Field label="관리자 코드" hint={`Supabase → Edge Functions → Secrets의 ADMIN_CODE_${server} 값을 바꾸면 됩니다.`} />
          <Field label="점수 기준" hint="병종 가중치 보병 3 · 궁병 2 · 기병 1 / 병종 점수 = TG×10 + (T−8)×3 (src/config.js에서 조정)" />
          <Btn kind="ghost" onClick={logout}>로그아웃</Btn>
        </div>
      )}
    </div>
  );
}

function MemberRow({ name, sub, current, onMove, overlap }) {
  return (
    <div className={`member ${overlap ? "" : "nooverlap"}`}>
      <div className="info">
        <div className="n">{name} <span className="accent">{sub ? totalScore(sub) : "?"}</span></div>
        {sub && <div className="m">{sub.slots.join(",")} · {HEROES.filter((h) => sub.heroes?.[h]).join(",") || "-"}</div>}
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
  const [view, setView] = useState("home");
  const [season, setSeason] = useState(null);
  const [admin, setAdmin] = useState(() => { try { return JSON.parse(sessionStorage.getItem("admin")) || null; } catch { return null; } });
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [done, setDone] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const activeServer = view === "admin" && admin ? admin.server : server;

  useEffect(() => {
    if (!api.configured || !activeServer) return;
    setSeason(null);
    api.getSeason(activeServer).then(setSeason).catch((e) => setLoadErr("서버 연결에 실패했어요: " + e.message));
  }, [activeServer]);

  const pickServer = (sv) => { localStorage.setItem("server", sv); setServer(sv); };
  const goHome = () => { setView("home"); setDone(null); };
  const logout = () => { sessionStorage.removeItem("admin"); setAdmin(null); setView("home"); };
  const tryLogin = async () => {
    setCodeErr("");
    try {
      const r = await api.admin(codeInput, "login");
      const a = { code: codeInput, server: r.server };
      sessionStorage.setItem("admin", JSON.stringify(a)); setAdmin(a); setView("admin");
    } catch (e) { setCodeErr(/invalid code/.test(e.message) ? "코드가 맞지 않아요." : "확인 실패: " + e.message); }
  };

  if (!api.configured) return (
    <div className="wrap"><div className="err">환경 변수 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았어요. Vercel 프로젝트 설정에서 추가한 뒤 다시 배포하세요.</div></div>
  );

  return (
    <div className="wrap">
      <div className="top">
        <button className="title-btn" onClick={goHome}>
          <h1>집결 배정</h1>
          <div className="sub">{activeServer ? `${activeServer} 서버 · ${season ? `${season}회차` : "…"}` : "서버를 선택하세요"}</div>
        </button>
        {view !== "home" && <Btn small kind="ghost" onClick={goHome}>처음으로</Btn>}
      </div>
      {loadErr && <div className="err">{loadErr}</div>}

      {view === "home" && (
        <div className="stack">
          <Field label="내 서버">
            <Pills options={SERVERS} value={server} onChange={pickServer} />
          </Field>
          <Btn onClick={() => setView("form")} disabled={!server || !season}>내 정보 제출하기</Btn>
          <Btn kind="ghost" onClick={() => setView("result")} disabled={!server || !season}>배정 결과 확인</Btn>
          <div className="footer-link">
            <button onClick={() => setView(admin ? "admin" : "login")}>관리자</button>
          </div>
        </div>
      )}
      {view === "form" && !done && <UserForm server={server} season={season} onDone={setDone} />}
      {view === "form" && done && (
        <div className="panel">
          <div className="ok" style={{ fontSize: 20, fontWeight: 700 }}>제출 완료</div>
          <div className="mt">{done.name}님의 정보가 {server} 서버 {season}회차에 저장됐어요. 배정이 공개되면 "배정 결과 확인"에서 볼 수 있어요.</div>
        </div>
      )}
      {view === "result" && <UserResult server={server} season={season} />}
      {view === "login" && (
        <div>
          <Field label="관리자 코드" hint="입력한 코드에 해당하는 서버의 관리자 화면으로 들어가요.">
            <input type="password" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryLogin()} />
          </Field>
          {codeErr && <div className="err">{codeErr}</div>}
          <Btn onClick={tryLogin} disabled={!codeInput}>들어가기</Btn>
        </div>
      )}
      {view === "admin" && admin && season && (
        <Admin code={admin.code} server={admin.server} season={season} setSeason={setSeason} logout={logout} />
      )}
    </div>
  );
}

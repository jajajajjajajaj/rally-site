
// 시간대: value는 저장되는 값(기존 데이터와 호환), kst/utc는 표시용
export const SLOTS = [
  { value: "21~22시", kst: "21:00~22:00", utc: "12:00~13:00" },
  { value: "22~23시", kst: "22:00~23:00", utc: "13:00~14:00" },
  { value: "23~24시", kst: "23:00~24:00", utc: "14:00~15:00" },
  { value: "24~01시", kst: "00:00~01:00", utc: "15:00~16:00" },
  { value: "01~02시", kst: "01:00~02:00", utc: "16:00~17:00" },
];
export const SLOT_VALUES = SLOTS.map((s) => s.value);

// 영웅: value는 저장되는 값, en은 영어 표시명 (게임 내 영문명으로 수정하세요)
export const HEROES = [
  { value: "파드", en: "Pard" },
  { value: "힐데", en: "Hilde" },
  { value: "하워드", en: "Howard" },
  { value: "고든", en: "Gordon" },
  { value: "살로", en: "Saul" },
  { value: "아마네", en: "Amane" },
  { value: "첸코", en: "Chenko" },
  { value: "트리톤", en: "Triton" },
  { value: "비비안", en: "Vivian" },
  { value: "쓰루드", en: "Thrud" },
];
export const HERO_VALUES = HEROES.map((h) => h.value);

export const TROOPS = [
  { key: "inf", ko: "보병", en: "Infantry", w: 3 },
  { key: "arc", ko: "궁병", en: "Archer", w: 2 },
  { key: "cav", ko: "기병", en: "Cavalry", w: 1 },
];
export const TG_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
export const T_LEVELS = [9, 10, 11];
export const RANK_VALUES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "그 외"];
export const RALLY_SIZE = 8;
export const RIDER_RALLIES = 6;   // 영웅 탑승 지정을 적용할 집결 수 (1~6번)
export const RIDERS_PER_RALLY = 4;

// 점수: 병종 가중치 × (TG×10 + (T−8)×3)
export const troopScore = (tg, t) => tg * 10 + (t - 8) * 3;
export const totalScore = (s) =>
  TROOPS.reduce((acc, tr) => acc + tr.w * troopScore(s[tr.key + "_tg"], s[tr.key + "_t"]), 0);

// ===== 문구 =====
export const STR = {
  ko: {
    title: "집결 배정", server: "서버", season: (n) => `${n}회차`, pickServer: "서버를 선택하세요", myServer: "내 서버",
    submit: "내 정보 제출하기", checkResult: "배정 결과 확인", admin: "관리자", home: "처음으로",
    name: "이름 (게임 닉네임)", nameHint: "같은 이름으로 다시 제출하면 이전 내용이 덮어써져요.", nickname: "닉네임",
    slots: "참여 가능한 시간", slotsHint: "가능한 시간을 모두 선택 (한국시간 / UTC)",
    rank: "서버 내 시련 순위", other: "그 외", tg: "TG 레벨", t: "T 레벨",
    heroes: "스킬 5렙 영웅", heroesHint: "5렙인 영웅만 선택",
    missing: "아직 입력 안 한 항목", saving: "저장 중…", submitBtn: "제출하기",
    saveFail: "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
    doneTitle: "제출 완료", done: (n, sv, se) => `${n}님의 정보가 ${sv} 서버 ${se}회차에 저장됐어요. 배정이 공개되면 "배정 결과 확인"에서 볼 수 있어요.`,
    check: "결과 확인", notPublished: "아직 배정 결과가 공개되지 않았어요.", notFound: "배정 명단에 이름이 없어요. 닉네임을 확인해 주세요.",
    loadFail: "불러오지 못했어요. 다시 시도해 주세요.", rally: (n) => `${n}번 집결`, youLead: "당신이 집결장입니다.", leader: "집결장", members: "참여 인원", none: "없음",
    adminCode: "관리자 코드", adminCodeHint: "입력한 코드에 해당하는 서버의 관리자 화면으로 들어가요.", wrongCode: "코드가 맞지 않아요.", enter: "들어가기",
    connFail: "서버 연결에 실패했어요", envMissing: "환경 변수 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았어요.",
    riders: "영웅 탑승", yourHero: (h) => `당신은 ${h} 영웅으로 탑승해 주세요.`,
    noServers: "등록된 서버가 없어요. 총괄 관리자가 서버를 추가해야 합니다.", loadingServers: "서버 목록 불러오는 중…",
    field: { name: "이름", slots: "가능 시간", rank: "시련 순위", level: (tr) => `${tr} 레벨` },
  },
  en: {
    title: "Rally Assignment", server: "Server", season: (n) => `Round ${n}`, pickServer: "Select your server", myServer: "My server",
    submit: "Submit my info", checkResult: "Check my assignment", admin: "Admin", home: "Home",
    name: "Name (in-game nickname)", nameHint: "Submitting again with the same name overwrites the previous entry.", nickname: "Nickname",
    slots: "Available time", slotsHint: "Select all that apply (KST / UTC)",
    rank: "Trial rank on server", other: "Other", tg: "TG level", t: "T level",
    heroes: "Heroes with skill level 5", heroesHint: "Select only heroes at level 5",
    missing: "Not filled yet", saving: "Saving…", submitBtn: "Submit",
    saveFail: "Failed to save. Please try again in a moment.",
    doneTitle: "Submitted", done: (n, sv, se) => `${n}'s info has been saved for server ${sv}, round ${se}. Once assignments are published you can see yours under "Check my assignment".`,
    check: "Check", notPublished: "Assignments have not been published yet.", notFound: "Your name is not on the list. Please check your nickname.",
    loadFail: "Could not load. Please try again.", rally: (n) => `Rally ${n}`, youLead: "You are the rally leader.", leader: "Leader", members: "Members", none: "None",
    adminCode: "Admin code", adminCodeHint: "Opens the admin page for the server matching your code.", wrongCode: "Incorrect code.", enter: "Enter",
    connFail: "Could not connect to server", envMissing: "Environment variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set.",
    riders: "Hero assignments", yourHero: (h) => `Please join with ${h}.`,
    noServers: "No servers registered yet. The head admin needs to add one.", loadingServers: "Loading servers…",
    field: { name: "Name", slots: "Available time", rank: "Trial rank", level: (tr) => `${tr} level` },
  },
};

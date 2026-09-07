export const SERVERS = ["943", "1117"];
export const SLOTS = ["21~22시", "22~23시", "23~24시", "24~01시", "01~02시"];
export const HEROES = ["파드", "힐데", "하워드", "고든", "살로", "아마네", "첸코"];
export const TROOPS = [
  { key: "inf", label: "보병", w: 3 },
  { key: "arc", label: "궁병", w: 2 },
  { key: "cav", label: "기병", w: 1 },
];
export const TG_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];
export const T_LEVELS = [9, 10, 11];
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "그 외"];
export const RALLY_SIZE = 8;

// 점수: 병종 가중치 × (TG×10 + (T−8)×3)
export const troopScore = (tg, t) => tg * 10 + (t - 8) * 3;
export const totalScore = (s) =>
  TROOPS.reduce((acc, tr) => acc + tr.w * troopScore(s[tr.key + "_tg"], s[tr.key + "_t"]), 0);

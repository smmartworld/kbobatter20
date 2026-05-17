/**
 * 네이버 스포츠 문자중계 API 기반 크롤러
 * API: https://api-gw.sports.naver.com/schedule/games/{gameId}/relay?inning=N
 *
 * type 1: 투구 이벤트 (구속, 구종, 투구 결과)
 * type 8: 타자 등장
 * type 13: 타석 결과 (삼진, 안타, 홈런, 볼넷 등)
 * type 23: 타석 결과 (아웃)
 */

import axios from "axios";
import * as cheerio from "cheerio";

const NAVER_API_BASE = "https://api-gw.sports.naver.com";
const KBO_BASE_URL = "https://www.koreabaseball.com";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://sports.naver.com/",
  Accept: "application/json",
};

// 팀명 -> 네이버 코드
export const TEAM_TO_NAVER_CODE: Record<string, string> = {
  삼성: "SS",
  LG: "LG",
  SSG: "SK",
  KT: "KT",
  KIA: "HT",
  두산: "OB",
  한화: "HH",
  NC: "NC",
  롯데: "LT",
  키움: "WO",
};

// 네이버 코드 -> 팀명
export const NAVER_CODE_TO_TEAM: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_TO_NAVER_CODE).map(([k, v]) => [v, k])
);

export interface NaverAtBat {
  gameId: string;
  gameDate: string;
  opponent: string;
  inning: number;
  homeOrAway: string;
  batOrder: number;
  batterName: string;
  batterPcode: string;
  pitcherName: string;
  pitcherPcode: string;
  resultCode: string;
  resultText: string;
  base1: number;
  base2: number;
  base3: number;
  outCount: number;
  pitchCount: number;
  lastPitchSpeed: string;
  lastPitchType: string;
}

/**
 * 타석 결과 텍스트 -> 결과 코드 변환 (정확한 파싱)
 * type 13: 삼진, 볼넷, 사구, 안타, 홈런, 실책 출루 등
 * type 23: 아웃 (땅볼, 플라이, 라인드라이브 등)
 */
function parseResultCode(text: string, type: number): string {
  if (!text) return "O";
  const t = text;

  // 홈런
  if (t.includes("홈런")) return "HR";
  // 3루타
  if (t.includes("3루타")) return "3B";
  // 2루타
  if (t.includes("2루타")) return "2B";
  // 안타 (1루타 포함)
  if (t.includes("안타") || t.includes("1루타")) return "H";
  // 볼넷
  if (t.includes("볼넷")) return "BB";
  // 몸에 맞는 볼 (사구) - 출루
  if (t.includes("몸에 맞는 볼") || t.includes("사구")) return "BB";
  // 삼진
  if (t.includes("삼진")) return "K";
  // 병살타
  if (t.includes("병살")) return "GDP";
  // 실책 출루
  if (t.includes("실책") && (t.includes("출루") || t.includes("진루"))) return "E";
  // 희생번트
  if (t.includes("희생번트")) return "SAC";
  // 희생플라이
  if (t.includes("희생플라이")) return "SAC";
  // 인필드 플라이
  if (t.includes("인필드 플라이")) return "O";
  // type 23은 기본적으로 아웃
  if (type === 23) return "O";
  // type 13에서 아웃 관련
  if (t.includes("아웃")) return "O";

  return "O";
}

/**
 * 특정 경기의 문자중계에서 타석별 기록 추출
 */
export async function fetchGameAtBats(
  gameId: string,
  gameDate: string
): Promise<NaverAtBat[]> {
  const allAtBats: NaverAtBat[] = [];

  try {
    const awayCode = gameId.substring(8, 10);
    const homeCode = gameId.substring(10, 12);
    const opponentMap: Record<string, string> = {
      "1": NAVER_CODE_TO_TEAM[awayCode] || awayCode,
      "0": NAVER_CODE_TO_TEAM[homeCode] || homeCode,
    };

    for (let inning = 1; inning <= 12; inning++) {
      try {
        const response = await axios.get(
          `${NAVER_API_BASE}/schedule/games/${gameId}/relay`,
          { params: { inning }, headers: HEADERS, timeout: 8000 }
        );

        const relayData = response.data?.result?.textRelayData;
        if (!relayData) break;

        const maxInning = relayData.inn || 0;
        if (inning > maxInning && inning > 1) break;

        // pcode -> 이름 매핑
        const pcodeMap: Record<string, string> = {};
        for (const side of ["homeLineup", "awayLineup", "homeEntry", "awayEntry"]) {
          const lineup = relayData[side] || {};
          for (const pt of ["batter", "pitcher"]) {
            for (const p of lineup[pt] || []) {
              if (p.pcode && p.name) pcodeMap[p.pcode] = p.name;
            }
          }
        }

        const textRelays = relayData.textRelays || [];

        for (const relay of textRelays) {
          const homeOrAway = relay.homeOrAway || "0";
          const opts = relay.textOptions || [];

          let currentBatter: any = null;
          let currentPitcherPcode: string | null = null;
          let currentGameState: any = null;
          let pitchCount = 0;
          let lastPitchSpeed = "";
          let lastPitchType = "";

          for (const opt of opts) {
            const type = opt.type;

            if (type === 8) {
              // 타자 등장 - 투구 카운터 초기화
              currentBatter = opt.batterRecord || {};
              currentGameState = opt.currentGameState || {};
              currentPitcherPcode = currentGameState.pitcher || null;
              pitchCount = 0;
              lastPitchSpeed = "";
              lastPitchType = "";
            } else if (type === 1) {
              // 투구 이벤트 - 구속/구종/투구수 수집
              pitchCount = opt.pitchNum || pitchCount + 1;
              if (opt.speed) lastPitchSpeed = opt.speed;
              if (opt.stuff) lastPitchType = opt.stuff;
            } else if (type === 13 || type === 23) {
              // 타석 결과
              if (!currentBatter?.name) continue;

              const resultText = opt.text || "";
              const resultCode = parseResultCode(resultText, type);
              const gs = currentGameState || {};

              const base1 = gs.base1 && gs.base1 !== "0" ? 1 : 0;
              const base2 = gs.base2 && gs.base2 !== "0" ? 1 : 0;
              const base3 = gs.base3 && gs.base3 !== "0" ? 1 : 0;
              // 💡 아웃카운트가 3으로 오면, 타석에 들어설 당시엔 2아웃이었다는 뜻이므로 강제 보정!
              let currentOuts = parseInt(gs.out || "0") || 0;
              if (currentOuts >= 3) currentOuts = 2;

              const pitcherName = currentPitcherPcode
                ? pcodeMap[currentPitcherPcode] || ""
                : "";
              const opponent = opponentMap[homeOrAway] || "";

              allAtBats.push({
                gameId,
                gameDate,
                opponent,
                inning,
                homeOrAway,
                batOrder: currentBatter.batOrder || 0,
                batterName: currentBatter.name,
                batterPcode: currentBatter.pcode || "",
                pitcherName,
                pitcherPcode: currentPitcherPcode || "",
                resultCode,
                resultText,
                base1,
                base2,
                base3,
                outCount: currentOuts,
                pitchCount,
                lastPitchSpeed,
                lastPitchType,
              });

              currentBatter = null;
              pitchCount = 0;
              lastPitchSpeed = "";
              lastPitchType = "";
            }
          }
        }

        if (inning >= maxInning) break;
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        console.warn(`[Naver Crawler] Inning ${inning} error for ${gameId}`);
        break;
      }
    }

    console.log(`[Naver Crawler] ${gameId}: ${allAtBats.length} at-bats`);
    return allAtBats;
  } catch (error) {
    console.error(`[Naver Crawler] Error fetching ${gameId}:`, error);
    return [];
  }
}

/**
 * KBO 공식사이트에서 선수의 최근 경기 날짜 목록 수집
 */
export async function fetchPlayerGameDates(
  kboPlayerId: string
): Promise<{ date: string; opponent: string }[]> {
  try {
    const url = `${KBO_BASE_URL}/Record/Player/HitterDetail/Daily.aspx?playerId=${kboPlayerId}`;
    const response = await axios.get(url, {
      headers: { "User-Agent": HEADERS["User-Agent"] },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const gameDates: { date: string; opponent: string }[] = [];

    $("table tbody tr").each((_: number, element: any) => {
      const cells = $(element).find("td");
      if (cells.length < 2 || $(cells[0]).text().includes("합계")) return;

      const gameDate = $(cells[0]).text().trim();
      const opponent = $(cells[1]).text().trim();

      if (!/\d{2}\.\d{2}/.test(gameDate)) return;

      const currentYear = new Date().getFullYear();
      const [month, day] = gameDate.split(".").map(Number);
      const fullDate = `${currentYear}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;

      gameDates.push({ date: fullDate, opponent });
    });

    return gameDates.reverse();
  } catch (error) {
    console.error("[Naver Crawler] Error fetching game dates:", error);
    return [];
  }
}

/**
 * 특정 날짜에 특정 팀이 출전한 경기 ID 찾기 (상대팀 정보 활용으로 최적화)
 */
export async function findGameIdForTeam(
  date: string,
  teamName: string,
  opponentName?: string
): Promise<string | null> {
  const teamCode = TEAM_TO_NAVER_CODE[teamName];
  if (!teamCode) return null;

  const year = date.substring(0, 4);

  // 상대팀 정보가 있으면 직접 구성
  if (opponentName) {
    const opponentCode = TEAM_TO_NAVER_CODE[opponentName];
    if (opponentCode) {
      const awayGameId = `${date}${teamCode}${opponentCode}0${year}`;
      const homeGameId = `${date}${opponentCode}${teamCode}0${year}`;

      for (const gameId of [awayGameId, homeGameId]) {
        try {
          const r = await axios.get(
            `${NAVER_API_BASE}/schedule/games/${gameId}/relay`,
            { params: { inning: 1 }, headers: HEADERS, timeout: 5000 }
          );
          if (r.status === 200 && r.data?.result?.textRelayData?.inn) {
            return gameId;
          }
        } catch { /* ignore */ }
      }
    }
  }

  // 상대팀 모를 때 전체 시도
  const allTeamCodes = Object.values(TEAM_TO_NAVER_CODE);
  for (const otherCode of allTeamCodes) {
    if (otherCode === teamCode) continue;
    const awayGameId = `${date}${teamCode}${otherCode}0${year}`;
    const homeGameId = `${date}${otherCode}${teamCode}0${year}`;

    for (const gameId of [awayGameId, homeGameId]) {
      try {
        const r = await axios.get(
          `${NAVER_API_BASE}/schedule/games/${gameId}/relay`,
          { params: { inning: 1 }, headers: HEADERS, timeout: 3000 }
        );
        if (r.status === 200 && r.data?.result?.textRelayData?.inn) {
          return gameId;
        }
      } catch { /* ignore */ }
    }
  }

  return null;
}

/**
 * 선수의 최근 N타석 기록 수집 (네이버 문자중계 기반)
 */
export async function fetchPlayerRecentAtBats(
  kboPlayerId: string,
  playerName: string,
  teamName: string,
  limit: number = 20
): Promise<NaverAtBat[]> {
  const allAtBats: NaverAtBat[] = [];

  const gameDates = await fetchPlayerGameDates(kboPlayerId);
  console.log(`[Naver Crawler] ${playerName}: ${gameDates.length} game dates found`);

  for (const { date, opponent } of gameDates) {
    if (allAtBats.length >= limit) break;

    try {
      const gameId = await findGameIdForTeam(date, teamName, opponent);
      if (!gameId) {
        console.warn(`[Naver Crawler] No game found for ${teamName} on ${date}`);
        continue;
      }

      const gameAtBats = await fetchGameAtBats(gameId, date);
      const playerAtBats = gameAtBats.filter((ab) => ab.batterName === playerName);

      if (playerAtBats.length > 0) {
        allAtBats.push(...playerAtBats);
        console.log(`[Naver Crawler] ${date}: ${playerAtBats.length} at-bats for ${playerName}`);
      }

      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      console.warn(`[Naver Crawler] Error for ${date}:`, err);
    }
  }
  // [이렇게 수정!]
  // 💡 같은 날짜라면 9회가 1회보다 더 최근이니까 먼저 나오도록 정렬!
  allAtBats.sort((a, b) => {
    if (a.gameDate !== b.gameDate) return b.gameDate.localeCompare(a.gameDate);
    return b.inning - a.inning; // 이닝 내림차순 (9회 -> 1회)
  });

  return allAtBats.slice(0, limit);
}

export function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export function getRecentDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

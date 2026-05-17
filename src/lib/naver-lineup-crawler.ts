/**
 * 네이버 문자중계 라인업 기반 1군 선수 목록 수집
 * 최근 경기 라인업에서 실제 출전 선수만 수집 (2군 제외)
 */

import axios from "axios";
import { TEAM_TO_NAVER_CODE, NAVER_CODE_TO_TEAM } from "./naver-crawler";

const NAVER_API_BASE = "https://api-gw.sports.naver.com";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: "https://sports.naver.com/",
};

// 포지션 코드 -> 포지션 이름 매핑
const POS_CODE_MAP: Record<number, string> = {
  0: "지명타자",
  1: "투수",
  2: "포수",
  3: "1루수",
  4: "2루수",
  5: "3루수",
  6: "유격수",
  7: "좌익수",
  8: "중견수",
  9: "우익수",
  10: "대타",
  11: "대주자",
};

export interface LineupPlayer {
  pcode: string;
  name: string;
  teamCode: string;
  teamName: string;
  posCode: number;
  position: string;
  backNumber: number | null;
  hitType: string | null;
}

/**
 * 특정 경기의 명단에서 선수 목록 추출 (Lineup + Entry 모두 합침!)
 */
async function extractEntryFromGame(
  gameId: string
): Promise<{ [teamCode: string]: LineupPlayer[] }> {
  try {
    const r = await axios.get(
      `${NAVER_API_BASE}/schedule/games/${gameId}/relay`,
      { params: { inning: 1 }, headers: HEADERS, timeout: 5000 }
    );

    if (r.status !== 200) return {};

    const relay = r.data?.result?.textRelayData;
    if (!relay?.inn) return {};

    const awayCode = gameId.substring(8, 10);
    const homeCode = gameId.substring(10, 12);
    const result: { [teamCode: string]: LineupPlayer[] } = {};

    // 💡 수정된 부분: home/away 각각 선발(Lineup)과 벤치(Entry)를 모두 합침!
    for (const prefix of ["home", "away"]) {
      const code = prefix === "home" ? homeCode : awayCode;
      
      const lineupBatters = relay[`${prefix}Lineup`]?.batter || [];
      const entryBatters = relay[`${prefix}Entry`]?.batter || [];
      const allBatters = [...lineupBatters, ...entryBatters]; // 두 명단 합체!

      const players: LineupPlayer[] = [];

      // 1군 엔트리에 있는 타자만 수집
      for (const p of allBatters) {
        const posCode = parseInt(p.pos) || 0;
        if (posCode === 1) continue; // 투수 제외

        players.push({
          pcode: p.pcode,
          name: p.name,
          teamCode: code,
          teamName: NAVER_CODE_TO_TEAM[code] || code,
          posCode,
          position: POS_CODE_MAP[posCode] || "내야수",
          backNumber: p.backnum ? parseInt(p.backnum) : null,
          hitType: p.hittype || null,
        });
      }

      // 혹시 Lineup과 Entry에 중복으로 들어간 선수가 있을 수 있으니 pcode 기준으로 중복 제거
      const uniquePlayers = Array.from(new Map(players.map(p => [p.pcode, p])).values());

      if (uniquePlayers.length > 0) {
        result[code] = uniquePlayers;
      }
    }

    return result;
  } catch {
    return {};
  }
}
/**
 * 모든 팀의 최신 1군 타자 목록 수집
 */
export async function crawlAllTeamLineups(): Promise<
  Map<string, Map<string, LineupPlayer>>
> {
  const teamPlayers = new Map<string, Map<string, LineupPlayer>>();

  for (const code of Object.values(TEAM_TO_NAVER_CODE)) {
    teamPlayers.set(code, new Map());
  }

  // 우천 취소 등을 고려해 최근 7일 탐색하지만, 팀별로 '최신 1경기'만 수집하면 스탑
  const dates: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${day}`);
  }

  const allTeamCodes = Object.values(TEAM_TO_NAVER_CODE);
  const completedTeams = new Set<string>(); // 💡 이미 최신 명단을 구한 팀 기록

  for (const date of dates) {
    // 모든 팀의 1군 명단을 최신 경기로 다 채웠으면 탐색 조기 종료!
    if (completedTeams.size === allTeamCodes.length) {
      console.log(`[Lineup Crawler] All teams updated with latest entry, stopping`);
      break;
    }

    const year = date.substring(0, 4);
    const promises: Promise<{ gameId: string; found: boolean }>[] = [];

    for (const away of allTeamCodes) {
      for (const home of allTeamCodes) {
        if (away === home) continue;
        
        // 💡 두 팀 모두 이미 최신 명단을 구했다면 API 호출 스킵 (속도 최적화)
        if (completedTeams.has(away) && completedTeams.has(home)) continue;

        const gameId = `${date}${away}${home}0${year}`;
        promises.push(
          axios
            .get(`${NAVER_API_BASE}/schedule/games/${gameId}/relay`, {
              params: { inning: 1 },
              headers: HEADERS,
              timeout: 3000,
            })
            .then((r) => ({
              gameId,
              found: r.status === 200 && !!r.data?.result?.textRelayData?.inn,
            }))
            .catch(() => ({ gameId, found: false }))
        );
      }
    }

    const results = await Promise.allSettled(promises);
    const dayGames = results
      .filter((res) => res.status === "fulfilled" && res.value.found)
      .map((res) => (res as PromiseFulfilledResult<any>).value.gameId);

    for (const gameId of dayGames) {
      const entries = await extractEntryFromGame(gameId);

      for (const [code, players] of Object.entries(entries)) {
        // 💡 아직 명단을 못 구한 팀인 경우에만 추가 (과거 경기로 덮어쓰는 것 방지)
        if (!completedTeams.has(code)) {
          const teamMap = teamPlayers.get(code);
          if (teamMap) {
            for (const player of players) {
              teamMap.set(player.pcode, player);
            }
            completedTeams.add(code); // 이 팀은 이제 끝!
          }
        }
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  // 결과 출력
  Array.from(teamPlayers.entries()).forEach(([code, players]) => {
    const teamName = NAVER_CODE_TO_TEAM[code] || code;
    console.log(`[Lineup Crawler] ${teamName}(${code}): ${players.size} players (1st League Entry)`);
  });

  return teamPlayers;
}
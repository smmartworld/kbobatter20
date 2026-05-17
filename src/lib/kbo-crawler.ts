/**
 * KBO 공식사이트 크롤링 유틸리티
 */

import axios from "axios";
import * as cheerio from "cheerio";

const KBO_BASE_URL = "https://www.koreabaseball.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// KBO 공식사이트 팀 코드 매핑
export const KBO_TEAM_CODES: Record<string, string> = {
  KT: "KT",
  LG: "LG",
  삼성: "SS",
  SSG: "SK",
  KIA: "HT",
  두산: "OB",
  한화: "HH",
  NC: "NC",
  롯데: "LT",
  키움: "WO",
};

export interface PlayerSearchResult {
  kboPlayerId: string;
  name: string;
  team: string;
  position: string;
  backNumber: number | null;
  birthDate: string | null;
  height: string | null;
  weight: string | null;
}

export interface AtBatRecord {
  gameDate: string;
  opponent: string;
  resultCode: string;
  avg: string;
  pa: number;
  ab: number;
  r: number;
  h: number;
  db: number;
  tb: number;
  hr: number;
  rbi: number;
  sb: number;
  cs: number;
  bb: number;
  hbp: number;
  so: number;
  gdp: number;
}

/**
 * ViewState 및 EventValidation 추출 헬퍼
 */
async function getFormState(url: string): Promise<{
  viewState: string;
  eventValidation: string;
  viewStateGenerator: string;
  cookies: string;
}> {
  const response = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT },
    timeout: 10000,
  });

  const $ = cheerio.load(response.data);
  const rawCookies = response.headers["set-cookie"];
  const cookies = Array.isArray(rawCookies) ? rawCookies.join("; ") : rawCookies || "";

  const getVal = (name: string) => {
    const val = $(`input[name="${name}"]`).val();
    return Array.isArray(val) ? val[0] : val || "";
  };

  return {
    viewState: getVal("__VIEWSTATE"),
    eventValidation: getVal("__EVENTVALIDATION"),
    viewStateGenerator: getVal("__VIEWSTATEGENERATOR"),
    cookies,
  };
}

/**
 * KBO 공식사이트에서 선수명으로 검색 (POST 요청)
 */
export async function searchPlayerByName(
  playerName: string
): Promise<PlayerSearchResult[]> {
  try {
    const searchUrl = `${KBO_BASE_URL}/Player/Search.aspx`;
    const { viewState, eventValidation, viewStateGenerator, cookies } =
      await getFormState(searchUrl);

    const formData: Record<string, string> = {
      __VIEWSTATE: viewState,
      __EVENTVALIDATION: eventValidation,
      __VIEWSTATEGENERATOR: viewStateGenerator,
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$ddlTeam": "",
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$ddlPosition": "",
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$txtSearchPlayerName":
        playerName,
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$btnSearch": "검색",
    };

    const searchResponse = await axios.post(
      searchUrl,
      new URLSearchParams(formData).toString(),
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: searchUrl,
          Cookie: cookies,
        },
        timeout: 15000,
      }
    );

    const $search = cheerio.load(searchResponse.data);
    const results: PlayerSearchResult[] = [];

    $search("table tbody tr").each((_: number, element: any) => {
      const cells = $search(element).find("td");
      if (cells.length >= 4) {
        const playerLink = $search(cells[1]).find("a");
        const href = playerLink.attr("href");
        const kboPlayerId = href?.match(/playerId=(\d+)/)?.[1];

        if (kboPlayerId) {
          results.push({
            kboPlayerId,
            name: playerLink.text().trim(),
            team: $search(cells[2]).text().trim(),
            position: $search(cells[3]).text().trim(),
            backNumber: parseInt($search(cells[0]).text().trim()) || null,
            birthDate: null,
            height: null,
            weight: null,
          });
        }
      }
    });

    console.log(
      `[KBO Crawler] Found ${results.length} players for "${playerName}"`
    );
    return results;
  } catch (error) {
    console.error("[KBO Crawler] Error searching player:", error);
    throw error;
  }
}

/**
 * 팀 코드로 해당 팀의 모든 선수 조회
 */
export async function fetchTeamPlayers(
  teamCode: string
): Promise<PlayerSearchResult[]> {
  try {
    const searchUrl = `${KBO_BASE_URL}/Player/Search.aspx`;
    const { viewState, eventValidation, viewStateGenerator, cookies } =
      await getFormState(searchUrl);

    const formData: Record<string, string> = {
      __VIEWSTATE: viewState,
      __EVENTVALIDATION: eventValidation,
      __VIEWSTATEGENERATOR: viewStateGenerator,
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$ddlTeam": teamCode,
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$ddlPosition": "",
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$txtSearchPlayerName": "",
      "ctl00$ctl00$ctl00$cphContents$cphContents$cphContents$btnSearch": "검색",
    };

    const searchResponse = await axios.post(
      searchUrl,
      new URLSearchParams(formData).toString(),
      {
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: searchUrl,
          Cookie: cookies,
        },
        timeout: 15000,
      }
    );

    const $search = cheerio.load(searchResponse.data);
    const results: PlayerSearchResult[] = [];

    $search("table tbody tr").each((_: number, element: any) => {
      const cells = $search(element).find("td");
      if (cells.length >= 4) {
        const playerLink = $search(cells[1]).find("a");
        const href = playerLink.attr("href");
        const kboPlayerId = href?.match(/playerId=(\d+)/)?.[1];

        if (kboPlayerId) {
          results.push({
            kboPlayerId,
            name: playerLink.text().trim(),
            team: $search(cells[2]).text().trim(),
            position: $search(cells[3]).text().trim(),
            backNumber: parseInt($search(cells[0]).text().trim()) || null,
            birthDate: null,
            height: null,
            weight: null,
          });
        }
      }
    });

    console.log(
      `[KBO Crawler] Found ${results.length} players for team code "${teamCode}"`
    );
    return results;
  } catch (error) {
    console.error(
      `[KBO Crawler] Error fetching team players for ${teamCode}:`,
      error
    );
    return [];
  }
}

/**
 * 선수의 일자별 타석 기록 조회
 */
export async function fetchPlayerAtBats(
  kboPlayerId: string
): Promise<AtBatRecord[]> {
  try {
    const dailyRecordUrl = `${KBO_BASE_URL}/Record/Player/HitterDetail/Daily.aspx?playerId=${kboPlayerId}`;

    const response = await axios.get(dailyRecordUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const atBats: AtBatRecord[] = [];

    $("table tbody tr").each((_: number, element: any) => {
      const cells = $(element).find("td");

      if (cells.length < 3 || $(cells[0]).text().includes("합계")) {
        return;
      }

      const gameDate = $(cells[0]).text().trim();
      const opponent = $(cells[1]).text().trim();

      if (!/\d{2}\.\d{2}/.test(gameDate)) {
        return;
      }

      const currentYear = new Date().getFullYear();
      const [month, day] = gameDate.split(".").map(Number);
      const fullDate = `${currentYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      const record: AtBatRecord = {
        gameDate: fullDate,
        opponent,
        resultCode: "",
        avg: $(cells[2]).text().trim(),
        pa: parseInt($(cells[3]).text().trim()) || 0,
        ab: parseInt($(cells[4]).text().trim()) || 0,
        r: parseInt($(cells[5]).text().trim()) || 0,
        h: parseInt($(cells[6]).text().trim()) || 0,
        db: parseInt($(cells[7]).text().trim()) || 0,
        tb: parseInt($(cells[8]).text().trim()) || 0,
        hr: parseInt($(cells[9]).text().trim()) || 0,
        rbi: parseInt($(cells[10]).text().trim()) || 0,
        sb: parseInt($(cells[11]).text().trim()) || 0,
        cs: parseInt($(cells[12]).text().trim()) || 0,
        bb: parseInt($(cells[13]).text().trim()) || 0,
        hbp: parseInt($(cells[14]).text().trim()) || 0,
        so: parseInt($(cells[15]).text().trim()) || 0,
        gdp: parseInt($(cells[16]).text().trim()) || 0,
      };

      // 경기 결과 코드 결정 (경기 단위 합산 기준)
      if (record.hr > 0) {
        record.resultCode = "HR";
      } else if (record.h >= 3) {
        record.resultCode = "MH"; // 멀티히트
      } else if (record.h > 0) {
        record.resultCode = "H";
      } else if (record.bb > 0) {
        record.resultCode = "BB";
      } else if (record.so > 0) {
        record.resultCode = "K";
      } else if (record.gdp > 0) {
        record.resultCode = "GDP";
      } else {
        record.resultCode = "O";
      }

      atBats.push(record);
    });

    return atBats;
  } catch (error) {
    console.error("[KBO Crawler] Error fetching at-bats:", error);
    throw error;
  }
}

export async function fetchPlayerDetails(
  kboPlayerId: string
): Promise<Partial<PlayerSearchResult> & { 
  seasonAvg?: string; seasonObp?: string; seasonSlg?: string; seasonOps?: string; 
  seasonHit?: number; seasonHr?: number; seasonRbi?: number 
}> {
  try {
    const basicUrl = `${KBO_BASE_URL}/Record/Player/HitterDetail/Basic.aspx?playerId=${kboPlayerId}`;

    const response = await axios.get(basicUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    const details: any = {};
    const currentYear = new Date().getFullYear().toString();

    // 💡 KBO 정규시즌 테이블 파싱 (최근 5경기 테이블 등 짧은 건 무시!)
    $("table tbody tr").each((_: number, element: any) => {
      const cells = $(element).find("td");
      
      // 진짜 정규시즌 데이터는 컬럼이 15개 이상임!
      if (cells.length < 15) return; 

      const rowText = $(cells[0]).text().trim();
      
      // "합계" 말고 정확히 "2026" 연도 기록만 가져오기!
      if (rowText === currentYear) {
        const avg = $(cells[1]).text().trim();
        const hit = parseInt($(cells[6]).text().trim()) || 0;
        const hr = parseInt($(cells[9]).text().trim()) || 0;
        const rbi = parseInt($(cells[10]).text().trim()) || 0;
        const slg = $(cells[17]).text().trim();
        const obp = $(cells[18]).text().trim();

        let ops = ".---";
        if (obp && slg && obp !== "-" && slg !== "-") {
          const opsVal = parseFloat(obp) + parseFloat(slg);
          ops = opsVal.toFixed(3).replace(/^0/, '');
        }

        if (avg && avg !== "-") {
          details.seasonAvg = avg.replace(/^0/, '');
          details.seasonObp = obp.replace(/^0/, '');
          details.seasonSlg = slg.replace(/^0/, '');
          details.seasonOps = ops;
          details.seasonHit = hit;
          details.seasonHr = hr;
          details.seasonRbi = rbi;
        }
      }
    });

    return details;
  } catch (error) {
    console.error("[KBO Crawler] Error fetching player details:", error);
    return {};
  }
}

/**
 * 최근 N개의 경기 기록 반환
 */
export function getRecentAtBatsLimit(
  atBats: AtBatRecord[],
  limit: number = 20
): AtBatRecord[] {
  const sorted = [...atBats].reverse();
  return sorted.slice(0, limit);
}

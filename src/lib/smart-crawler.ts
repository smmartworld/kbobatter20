import axios from 'axios';
import * as cheerio from 'cheerio';

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function formatStat(val: string) {
  if (!val || val === "-" || val === "0.000") return ".---";
  const num = parseFloat(val);
  if (isNaN(num)) return ".---";
  return num.toFixed(3).replace(/^0/, '');
}

export async function fetchSmartKboStats(kboPlayerId: string, playerName: string) {
  try {
    const url = `https://www.koreabaseball.com/Record/Player/HitterDetail/Basic.aspx?playerId=${kboPlayerId}`;
    const res = await axios.get(url, { headers: { "User-Agent": USER_AGENT }, timeout: 10000 });
    const $ = cheerio.load(res.data);

    let stats = { seasonAvg: ".---", seasonObp: ".---", seasonSlg: ".---", seasonOps: ".---", seasonHit: 0, seasonHr: 0, seasonRbi: 0 };

    // 💡 모든 테이블을 뒤져서 영어 약자(AVG, OBP 등)가 있는 시즌 스탯 테이블을 찾습니다!
    $("table").each((_, table) => {
      const headers: string[] = [];
      $(table).find("thead th").each((_, th) => headers.push($(th).text().trim().toUpperCase()));

      // 💡 [핵심] 최근 10경기 테이블(일자, 상대) 등 가짜 테이블은 스킵!
      if (headers.includes("일자") || headers.includes("상대")) return;

      // 1번 표 (타율, 안타, 홈런, 타점 추출)
      if (headers.includes("AVG") && headers.includes("H") && headers.includes("HR") && headers.includes("RBI")) {
        const idxAvg = headers.indexOf("AVG");
        const idxHit = headers.indexOf("H");
        const idxHr = headers.indexOf("HR");
        const idxRbi = headers.indexOf("RBI");

        // 정규시즌 성적은 표의 첫 번째 데이터 줄(합계 또는 소속팀)에 있음!
        const firstRow = $(table).find("tbody tr").first();
        const cells = firstRow.find("td");

        const avg = $(cells[idxAvg]).text().trim();
        const hit = parseInt($(cells[idxHit]).text().trim()) || 0;
        const hr = parseInt($(cells[idxHr]).text().trim()) || 0;
        const rbi = parseInt($(cells[idxRbi]).text().trim()) || 0;

        if (avg && avg !== "-" && avg !== "0.000") stats.seasonAvg = formatStat(avg);
        stats.seasonHit = Math.max(stats.seasonHit, hit);
        stats.seasonHr = Math.max(stats.seasonHr, hr);
        stats.seasonRbi = Math.max(stats.seasonRbi, rbi);
      }

      // 2번 표 (출루율, 장타율 추출)
      if (headers.includes("OBP") && headers.includes("SLG")) {
        const idxObp = headers.indexOf("OBP");
        const idxSlg = headers.indexOf("SLG");

        const firstRow = $(table).find("tbody tr").first();
        const cells = firstRow.find("td");

        const obp = $(cells[idxObp]).text().trim();
        const slg = $(cells[idxSlg]).text().trim();

        if (obp && obp !== "-") stats.seasonObp = formatStat(obp);
        if (slg && slg !== "-") stats.seasonSlg = formatStat(slg);
      }
    });

    // 출루율과 장타율을 구했으면 OPS 자동 계산
    if (stats.seasonObp !== ".---" && stats.seasonSlg !== ".---") {
      stats.seasonOps = (parseFloat(stats.seasonObp) + parseFloat(stats.seasonSlg)).toFixed(3).replace(/^0/, '');
    }

    return stats;
  } catch (error) {
    console.error(`[Smart Crawler] 에러 발생 (${playerName}):`, error);
    return { seasonAvg: ".---", seasonObp: ".---", seasonSlg: ".---", seasonOps: ".---", seasonHit: 0, seasonHr: 0, seasonRbi: 0 };
  }
}
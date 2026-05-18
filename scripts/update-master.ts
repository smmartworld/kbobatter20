import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { crawlAllTeamLineups } from '../src/lib/naver-lineup-crawler';
import { fetchGameAtBats, TEAM_TO_NAVER_CODE } from '../src/lib/naver-crawler';
import { searchPlayerByName } from '../src/lib/kbo-crawler';
import { fetchSmartKboStats } from '../src/lib/smart-crawler'; 

const NAVER_TEAM_TO_KBO_KEYWORD: Record<string, string> = {
  "삼성": "삼성", "LG": "LG", "SSG": "SSG", "KT": "KT", "KIA": "KIA",
  "두산": "두산", "한화": "한화", "NC": "NC", "롯데": "롯데", "키움": "키움",
};

function formatKboStat(val: string | number) {
  const num = parseFloat(val + "");
  if (isNaN(num)) return ".---";
  return num.toFixed(3).replace(/^0/, '');
}

async function fetchNaverSeasonStats(pcode: string) {
  try {
    const res = await axios.get(`https://api-gw.sports.naver.com/players/kbo/${pcode}/playerend-record`);
    const basicStr = res.data?.result?.basicRecord;
    
    if (basicStr) {
      const basic = JSON.parse(basicStr).basic;
      const obp = parseFloat(basic.obp || "0");
      const ops = parseFloat(basic.ops || "0");
      let slgVal = ops - obp;
      if (slgVal < 0) slgVal = 0;
      
      return {
        seasonAvg: basic.hra ? formatKboStat(basic.hra) : ".---",
        seasonObp: basic.obp ? formatKboStat(basic.obp) : ".---",
        seasonSlg: formatKboStat(slgVal),
        seasonOps: basic.ops ? formatKboStat(basic.ops) : ".---",
        seasonHit: basic.hit || 0,
        seasonHr: basic.hr || 0,
        seasonRbi: basic.rbi || 0
      };
    }
  } catch (error) {}
  
  return { seasonAvg: ".---", seasonObp: ".---", seasonSlg: ".---", seasonOps: ".---", seasonHit: 0, seasonHr: 0, seasonRbi: 0 };
}

async function generateData() {
  console.log('🔥 [마스터 로스터 누적 & 타석 수집] 시작...');
  const publicDir = path.join(process.cwd(), 'public', 'data');
  await fs.mkdir(publicDir, { recursive: true });

  const mergedRoster = new Map<string, any>();
  try {
    const fileData = await fs.readFile(path.join(publicDir, 'lineup.json'), 'utf-8');
    const existingLineup = JSON.parse(fileData);
    for (const players of Object.values(existingLineup)) {
      for (const p of players as any[]) {
        mergedRoster.set(p.pcode, p);
      }
    }
  } catch(e) {}

  const teamPlayersMap = await crawlAllTeamLineups();
  for (const [teamCode, playersMap] of teamPlayersMap.entries()) {
    for (const p of playersMap.values()) {
      mergedRoster.set(p.pcode, { ...p, teamCode }); 
    }
  }

  console.log(`🔥 총 ${mergedRoster.size}명 시즌 스탯 굽는 중...`);
  const lineupData: Record<string, any[]> = {};
  const activePlayerCodes = new Set<string>();

  for (const p of mergedRoster.values()) {
    activePlayerCodes.add(p.pcode);
    let stats = await fetchNaverSeasonStats(p.pcode);

    let kboPos = p.position; 
    let kboBackNum = p.backNumber;
    try {
      const searchResults = await searchPlayerByName(p.name);
      const kboKeyword = NAVER_TEAM_TO_KBO_KEYWORD[p.teamName] || p.teamName;
      const matched = searchResults.find((r: any) => p.teamName.includes(r.team) || r.team.includes(kboKeyword));

      if (matched) {
        kboPos = matched.position ? matched.position.split('(')[0] : kboPos;
        if (matched.backNumber !== null) kboBackNum = matched.backNumber;

        if (stats.seasonAvg === ".---") {
          const details = await fetchSmartKboStats(matched.kboPlayerId, p.name);
          if (details.seasonAvg !== ".---") {
            stats = details;
            console.log(`✅ [스마트 크롤러 우회 성공] ${p.name}`);
          }
        }
      }
    } catch (e) {}

    const updatedPlayer = { 
      ...p, 
      ...stats,
      position: kboPos,
      backNumber: kboBackNum
    };
    
    const tCode = updatedPlayer.teamCode;
    if (!lineupData[tCode]) lineupData[tCode] = [];
    lineupData[tCode].push(updatedPlayer);
    
    await new Promise(r => setTimeout(r, 100));
  }

  await fs.writeFile(
    path.join(publicDir, 'lineup.json'),
    JSON.stringify(lineupData, null, 2),
    'utf-8'
  );
  console.log('✅ 마스터 로스터 & 스탯 굽기 완료!');

  console.log('🔥 경기 타석 수집 중...');
  const dates: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    dates.push(`${y}${m}${day}`);
  }

  const allTeamCodes = Object.values(TEAM_TO_NAVER_CODE);
  const playerAtBatsMap = new Map<string, any[]>();
  for (const pcode of activePlayerCodes) {
    playerAtBatsMap.set(pcode, []);
  }

  for (const date of dates) {
    const year = date.substring(0, 4);
    const checkedGames = new Set<string>();

    for (const away of allTeamCodes) {
      for (const home of allTeamCodes) {
        if (away === home) continue;
        
        const gameId = `${date}${away}${home}0${year}`;
        if (checkedGames.has(gameId)) continue;
        checkedGames.add(gameId);

        const gameAtBats = await fetchGameAtBats(gameId, date);
        for (const ab of gameAtBats) {
          if (activePlayerCodes.has(ab.batterPcode)) {
            playerAtBatsMap.get(ab.batterPcode)!.push(ab);
          }
        }
      }
    }
  }

  // ✅ 데이터 누적(Merge) 로직 완벽 적용 완료!
  const playerDir = path.join(publicDir, 'players');
  await fs.mkdir(playerDir, { recursive: true });

  for (const [pcode, newAtBats] of playerAtBatsMap.entries()) {
    let existingAtBats: any[] = [];
    try {
      const fileData = await fs.readFile(path.join(playerDir, `${pcode}.json`), 'utf-8');
      existingAtBats = JSON.parse(fileData);
    } catch (e) {}

    const allAtBats = [...newAtBats, ...existingAtBats];

    const uniqueAtBats = Array.from(
      new Map(allAtBats.map(ab => [`${ab.gameDate}-${ab.inning}-${ab.resultText}`, ab])).values()
    );

    uniqueAtBats.sort((a, b) => {
      if (a.gameDate !== b.gameDate) return b.gameDate.localeCompare(a.gameDate);
      return b.inning - a.inning;
    });

    const recent20 = uniqueAtBats.slice(0, 20);
    await fs.writeFile(
      path.join(playerDir, `${pcode}.json`),
      JSON.stringify(recent20, null, 2),
      'utf-8'
    );
  }

  console.log('🚀 마스터 업데이트 완벽 종료!');
}

generateData();
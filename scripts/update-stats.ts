import fs from 'fs/promises';
import path from 'path';
import axios from 'axios';
import { searchPlayerByName, fetchPlayerDetails } from '../src/lib/kbo-crawler';

const NAVER_TEAM_TO_KBO_KEYWORD: Record<string, string> = {
  "삼성": "삼성",
  "LG": "LG",
  "SSG": "SSG",
  "KT": "KT",
  "KIA": "KIA",
  "두산": "두산",
  "한화": "한화",
  "NC": "NC",
  "롯데": "롯데",
  "키움": "키움",
};

function formatKboStat(val: string | number) {
  const num = parseFloat(val + "");
  if (isNaN(num)) return ".---";
  return num.toFixed(3).replace(/^0/, '');
}

async function updateSeasonStats() {
  console.log('🔥 [시즌 스탯 전용 크롤러] 출동 (네이버+KBO 이중 크롤링)...');
  const publicDir = path.join(process.cwd(), 'public', 'data');
  const lineupPath = path.join(publicDir, 'lineup.json');
  
  let lineupData: Record<string, any[]> = {};
  try {
    const fileData = await fs.readFile(lineupPath, 'utf-8');
    lineupData = JSON.parse(fileData);
  } catch (e) {
    console.log('❌ lineup.json 파일이 없어! 먼저 라인업을 수집해줘.');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (const [teamCode, players] of Object.entries(lineupData)) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      let isSuccess = false;

      // 1. 네이버 API 먼저 찌르기
      try {
        const res = await axios.get(`https://api-gw.sports.naver.com/players/kbo/${p.pcode}/playerend-record`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const basicStr = res.data?.result?.basicRecord;
        
        if (basicStr) {
          const basic = JSON.parse(basicStr).basic;
          if (basic) {
            const obp = parseFloat(basic.obp || "0");
            const ops = parseFloat(basic.ops || "0");
            let slgVal = ops - obp;
            if (slgVal < 0) slgVal = 0;
            
            players[i] = {
              ...p,
              seasonAvg: basic.hra ? formatKboStat(basic.hra) : ".---",
              seasonObp: basic.obp ? formatKboStat(basic.obp) : ".---",
              seasonSlg: formatKboStat(slgVal),
              seasonOps: basic.ops ? formatKboStat(basic.ops) : ".---",
              seasonHit: basic.hit || 0,
              seasonHr: basic.hr || 0,
              seasonRbi: basic.rbi || 0
            };
            isSuccess = true;
            console.log(`✅ [네이버 성공] ${p.name} (안타: ${basic.hit})`);
          }
        }
      } catch (error: any) {
        // 404 에러 발생 시 조용히 넘어감 (아래 KBO 크롤링으로 대체)
      }

      // 2. 네이버에서 실패했다면 KBO 공홈에서 우회 수집!
      if (!isSuccess) {
        console.log(`⚠️ 네이버 404 에러! ${p.name} 스탯 KBO 우회 수집 중...`);
        try {
          const searchResults = await searchPlayerByName(p.name);
          const kboKeyword = NAVER_TEAM_TO_KBO_KEYWORD[p.teamName] || p.teamName;
          const matched = searchResults.find((r: any) => p.teamName.includes(r.team) || r.team.includes(kboKeyword));
          
          if (matched) {
            const details = await fetchPlayerDetails(matched.kboPlayerId);
            players[i] = {
              ...p,
              seasonAvg: details.seasonAvg || ".---",
              seasonObp: ".---", 
              seasonSlg: ".---",
              seasonOps: ".---",
              seasonHit: details.seasonHit || 0, 
              seasonHr: details.seasonHr || 0,
              seasonRbi: details.seasonRbi || 0
            };
            isSuccess = true;
            console.log(`✅ [KBO 우회 성공] ${p.name} (홈런: ${details.seasonHr})`);
          } else {
             console.log(`❌ [매칭 실패] KBO 공홈에서도 ${p.name} 선수를 못 찾음`);
          }
        } catch (e) {
          console.log(`🚨 [KBO 우회 에러] ${p.name} 수집 실패`);
        }
      }

      if (isSuccess) successCount++;
      else failCount++;

      // 네이버 & KBO 서버 화내지 않게 0.2초 쿨타임
      await new Promise(r => setTimeout(r, 200)); 
    }
  }

  await fs.writeFile(lineupPath, JSON.stringify(lineupData, null, 2), 'utf-8');
  console.log(`\n🎉 완료! 성공: ${successCount}명 / 실패: ${failCount}명`);
}

updateSeasonStats();
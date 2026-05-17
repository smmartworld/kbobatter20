import fs from 'fs/promises';
import path from 'path';
import { fetchGameAtBats, TEAM_TO_NAVER_CODE } from '../src/lib/naver-crawler';

async function generateRecentData() {
  console.log('⚡ [빠른 업데이트] 최근 3일 타석 데이터 갱신 시작...');
  const publicDir = path.join(process.cwd(), 'public', 'data');
  const playerDir = path.join(publicDir, 'players');

  // 1. 기존 라인업 파일에서 현재 로스터 pcode만 뽑아옴
  const activePlayerCodes = new Set<string>();
  try {
    const fileData = await fs.readFile(path.join(publicDir, 'lineup.json'), 'utf-8');
    const existingLineup = JSON.parse(fileData);
    for (const players of Object.values(existingLineup)) {
      for (const p of players as any[]) {
        activePlayerCodes.add(p.pcode);
      }
    }
  } catch(e) {
    console.log('❌ lineup.json을 찾을 수 없습니다. 마스터 스크립트를 먼저 실행하세요.');
    return;
  }

  // 2. 최근 3일 치 타석만 후딱 수집
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
  const newAtBatsMap = new Map<string, any[]>();
  for (const pcode of activePlayerCodes) {
    newAtBatsMap.set(pcode, []);
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
            newAtBatsMap.get(ab.batterPcode)!.push(ab);
          }
        }
      }
    }
  }

  // 3. 기존 데이터와 병합 & 20개 커트 저장
  for (const pcode of activePlayerCodes) {
    let existingAtBats: any[] = [];
    try {
      const fileData = await fs.readFile(path.join(playerDir, `${pcode}.json`), 'utf-8');
      existingAtBats = JSON.parse(fileData);
    } catch (e) {}

    const allAtBats = [...newAtBatsMap.get(pcode)!, ...existingAtBats];
    
    // 중복 제거
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
  console.log('⚡ 쾌속 업데이트 완료!');
}

generateRecentData();
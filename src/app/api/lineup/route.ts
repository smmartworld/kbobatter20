import { NextResponse } from 'next/server';
import { crawlAllTeamLineups } from '@/lib/naver-lineup-crawler';

export async function GET() {
  try {
    // 네가 짠 크롤러 함수 실행!
    const teamPlayersMap = await crawlAllTeamLineups();

    // Map 객체는 프론트로 바로 못 넘겨서 JSON 객체로 변환해 줘야 해.
    const serializedData: Record<string, any[]> = {};
    
    teamPlayersMap.forEach((playersMap, teamCode) => {
      serializedData[teamCode] = Array.from(playersMap.values());
    });

    return NextResponse.json(serializedData);
  } catch (error) {
    console.error("API 라우트 에러:", error);
    return NextResponse.json(
      { error: '라인업을 가져오는 데 실패했습니다.' }, 
      { status: 500 }
    );
  }
}
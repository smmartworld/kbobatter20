import { NextResponse } from 'next/server';
import { fetchPlayerRecentAtBats } from '@/lib/naver-crawler';
import { searchPlayerByName } from '@/lib/kbo-crawler'; // 💡 KBO 크롤러 추가!

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pcode: string }> } // 👈 여기서 Promise로 감싸줬어!
) {
  // 👈 Next.js 16 규칙에 맞게 params를 await로 먼저 풀어주기!
  // (실제 로직에선 pcode를 안 쓰지만, 빌드 에러를 없애기 위해 꼭 해줘야 함)
  const resolvedParams = await params;
  const pcode = resolvedParams.pcode; 

  // 프론트에서 보낸 이름과 팀 정보를 꺼냄
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const team = searchParams.get('team');

  if (!name || !team) {
    return NextResponse.json({ error: '이름이나 팀 정보가 없습니다.' }, { status: 400 });
  }

  try {
    // 1. 네이버 pcode 대신, 이름으로 KBO 공식 사이트를 검색해서 진짜 KBO ID를 찾기!
    const searchResults = await searchPlayerByName(name);
    
    // 동명이인이 있을 수 있으니 소속 팀으로 필터링해서 정확한 선수 찾기
    const matchedPlayer = searchResults.find(p => p.team.includes(team) || team.includes(p.team));

    if (!matchedPlayer) {
      return NextResponse.json(
        { error: 'KBO 공식 사이트에서 선수를 찾을 수 없습니다.' }, 
        { status: 404 }
      );
    }

    const kboPlayerId = matchedPlayer.kboPlayerId;

    // 2. 찾은 진짜 KBO ID를 넣어서 20타석 기록 긁어오기
    const atBats = await fetchPlayerRecentAtBats(kboPlayerId, name, team, 20);
    
    return NextResponse.json(atBats);
  } catch (error) {
    console.error("API 라우트 에러:", error);
    return NextResponse.json(
      { error: '타석 기록을 가져오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}
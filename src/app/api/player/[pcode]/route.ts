import { NextRequest, NextResponse } from 'next/server';
import { fetchPlayerRecentAtBats } from '@/lib/naver-crawler';
import { searchPlayerByName } from '@/lib/kbo-crawler'; 

// 💡 두 번째 파라미터였던 params를 아예 싹 지워버렸어!
export async function GET(request: NextRequest) {
  // 프론트에서 보낸 이름과 팀 정보를 꺼냄
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');
  const team = searchParams.get('team');

  if (!name || !team) {
    return NextResponse.json({ error: '이름이나 팀 정보가 없습니다.' }, { status: 400 });
  }

  try {
    const searchResults = await searchPlayerByName(name);
    const matchedPlayer = searchResults.find(p => p.team.includes(team) || team.includes(p.team));

    if (!matchedPlayer) {
      return NextResponse.json(
        { error: 'KBO 공식 사이트에서 선수를 찾을 수 없습니다.' }, 
        { status: 404 }
      );
    }

    const kboPlayerId = matchedPlayer.kboPlayerId;
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
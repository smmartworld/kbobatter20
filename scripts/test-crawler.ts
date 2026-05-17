import { searchPlayerByName } from '../src/lib/kbo-crawler';
import { fetchSmartKboStats } from '../src/lib/smart-crawler';

async function runTest() {
  console.log("🔍 [1단계] KBO 공홈에서 '류지혁' 검색 시작...");
  
  try {
    const results = await searchPlayerByName("류지혁");
    console.log("🔎 검색 결과 뭉치:", results);

    // 삼성 라이온즈 류지혁 찾기
    const ryu = results.find((r: any) => r.team.includes("삼성"));
    
    if (ryu) {
      console.log(`\n✅ [2단계] 삼성 류지혁 찾음! (KBO ID: ${ryu.kboPlayerId})`);
      console.log(`\n🚀 [3단계] 스마트 크롤러로 스탯 훔쳐오기 시도...`);
      
      const stats = await fetchSmartKboStats(ryu.kboPlayerId, "류지혁");
      console.log("📊 최종 수집된 스탯 결과:");
      console.log(stats);
    } else {
      console.log("\n❌ 삼성 류지혁을 찾을 수 없습니다. (동명이인 문제거나 팀명이 다름)");
    }
  } catch (error) {
    console.error("🚨 테스트 중 에러 발생:", error);
  }
}

runTest();
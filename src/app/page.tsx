"use client";

import { useEffect, useState } from "react";

interface AtBat {
  gameDate: string;
  opponent: string;
  inning: number;
  pitcherName: string;
  resultText: string;
  resultCode: string;
  pitchCount: number;
  lastPitchSpeed: string;
  lastPitchType: string;
  base1: number;
  base2: number;
  base3: number;
  outCount: number;
}

export default function Home() {
  const [lineupData, setLineupData] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);
  const [atBats, setAtBats] = useState<AtBat[]>([]);
  const [modalLoading, setModalLoading] = useState(false);

  const [sortType, setSortType] = useState<'ops' | 'avg' | 'name'>('ops');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const fetchLineups = async () => {
      try {
        const response = await fetch("/data/lineup.json");
        if (!response.ok) throw new Error("데이터를 불러오지 못했습니다.");
        const data = await response.json();
        setLineupData(data);
        
        if (data && Object.keys(data).length > 0) {
          setSelectedTeam(data["SS"] ? "SS" : Object.keys(data)[0]);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchLineups();
  }, []);

  const openPlayerModal = async (player: any) => {
    setSelectedPlayer(player);
    setModalLoading(true);
    setAtBats([]);

    try {
      const timestamp = new Date().getTime();
      const res = await fetch(`/data/players/${player.pcode}.json?t=${timestamp}`);
      if (!res.ok) throw new Error("타석 기록을 가져오는 데 실패했습니다.");
      const data = await res.json();
      
      setAtBats(data.slice(0, 20));
    } catch (error) {
      console.error(error);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedPlayer(null);
    setAtBats([]);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    if (dateStr.includes("-")) return `${dateStr.split("-")[1]}.${dateStr.split("-")[2]}`;
    if (dateStr.length === 8) return `${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
    return dateStr;
  };

  const cleanResultText = (text: string, playerName: string) => {
    if (!text) return "";
    const regexName = new RegExp(`^${playerName}\\s*:\\s*`);
    let cleaned = text.replace(regexName, "");
    cleaned = cleaned.replace(/\s*\(.*?\)/g, "");
    return cleaned.trim();
  };

  const getTeamLogo = (teamCode: string) => {
    const logoMap: Record<string, string> = {
      SS: "삼성.png",
      LG: "LG.png",
      SK: "SSG.png",
      KT: "KT.png",
      HT: "기아.png",
      OB: "두산.png",
      HH: "한화.png",
      NC: "NC.png",
      LT: "롯데.png",
      WO: "키움.png",
    };
    return `/images/${logoMap[teamCode] || "default.png"}`;
  };

  const getTeamBorder = (teamCode: string) => {
    const colors: Record<string, string> = {
      SS: "border-blue-600",
      LG: "border-pink-700",
      SK: "border-red-500",
      KT: "border-slate-900",
      HT: "border-red-700",
      OB: "border-indigo-900",
      HH: "border-orange-500",
      NC: "border-blue-800",
      LT: "border-sky-800",
      WO: "border-rose-800",
    };
    return colors[teamCode] || "border-slate-300";
  };

  const sortPlayers = (players: any[]) => {
    return [...players].sort((a, b) => {
      if (sortType === 'ops') {
        const opsA = parseFloat(a.seasonOps) || 0;
        const opsB = parseFloat(b.seasonOps) || 0;
        return opsB - opsA;
      }
      if (sortType === 'avg') {
        const avgA = parseFloat(a.seasonAvg) || 0;
        const avgB = parseFloat(b.seasonAvg) || 0;
        return avgB - avgA;
      }
      if (sortType === 'name') {
        return a.name.localeCompare(b.name, 'ko-KR');
      }
      return 0;
    });
  };

  const calculateStats = () => {
    let pa = atBats.length;
    if (pa === 0) return { ab: 0, h: 0, hr: 0, bb: 0, k: 0, avg: ".---", obp: ".---", slg: ".---", ops: ".---" };

    let hr = 0, b3 = 0, b2 = 0, b1 = 0;
    let bb = 0, k = 0, sac = 0;

    atBats.forEach(ab => {
      const code = ab.resultCode || "O";
      if (code === "HR") hr++;
      else if (code === "3B") b3++;
      else if (code === "2B") b2++;
      else if (code === "H") b1++;
      else if (code === "BB") bb++;
      else if (code === "K") k++;
      else if (code === "SAC") sac++;
    });

    const h_total = b1 + b2 + b3 + hr;
    const ab_total = pa - bb - sac;
    const tb = b1 + (b2 * 2) + (b3 * 3) + (hr * 4);

    const formatStat = (num: number) => num.toFixed(3).replace(/^0/, '');

    const avg = ab_total > 0 ? formatStat(h_total / ab_total) : ".---";
    const obpDenom = ab_total + bb + sac;
    const obp = obpDenom > 0 ? formatStat((h_total + bb) / obpDenom) : ".---";
    const slg = ab_total > 0 ? formatStat(tb / ab_total) : ".---";
    
    let ops = ".---";
    if (obp !== ".---" && slg !== ".---") {
      ops = formatStat(parseFloat((h_total + bb) / obpDenom + "") + parseFloat(tb / ab_total + ""));
    }

    return { 
      ab: ab_total, 
      h: h_total, 
      hr: hr, 
      bb: bb, 
      k: k, 
      avg, obp, slg, ops 
    };
  };

  const stats = calculateStats();

  return (
    <main className="min-h-screen bg-slate-50 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-extrabold text-slate-800 tracking-tight">
            20타석 분석기 ⚾️
          </h1>
        </header>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 md:gap-3 max-w-3xl mx-auto mb-10">
              {Object.entries(lineupData).map(([teamCode, players]) => (
                <button
                  key={teamCode}
                  onClick={() => setSelectedTeam(teamCode)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl font-extrabold text-sm transition-all duration-300 justify-center ${
                    selectedTeam === teamCode
                      ? `bg-white border-2 text-slate-800 shadow-md scale-105 z-10 ${getTeamBorder(teamCode)}`
                      : "bg-slate-100 border border-slate-200 text-slate-400 grayscale opacity-60 hover:opacity-100 hover:grayscale-0 hover:bg-white"
                  }`}
                >
                  <img 
                    src={getTeamLogo(teamCode)} 
                    alt={teamCode} 
                    className="w-7 h-7 object-contain drop-shadow-sm"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  <span>{players[0]?.teamName?.split(' ')[0] || teamCode}</span>
                </button>
              ))}
            </div>

            {selectedTeam && lineupData[selectedTeam] && (
              <div className={`bg-white rounded-3xl shadow-sm p-8 border-t-8 max-w-5xl mx-auto ${getTeamBorder(selectedTeam)}`}>
                <div className="mb-8 flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-100 pb-5 gap-4">
                  <h2 className="text-3xl font-extrabold text-slate-800 flex items-center gap-3">
                    <img 
                      src={getTeamLogo(selectedTeam)} 
                      alt="로고" 
                      className="w-10 h-10 object-contain drop-shadow-sm"
                    />
                    {lineupData[selectedTeam][0]?.teamName}
                  </h2>
                  
                  <div className="flex items-center gap-3">
                    <select 
                      value={sortType}
                      onChange={(e) => setSortType(e.target.value as any)}
                      className="bg-slate-100 border-none text-slate-600 font-bold text-sm px-3 py-1.5 rounded-lg outline-none cursor-pointer hover:bg-slate-200 transition-colors"
                    >
                      <option value="ops">🔥 OPS순 정렬</option>
                      <option value="avg">⚾ 타율순 정렬</option>
                      <option value="name">🔠 이름순 정렬</option>
                    </select>
                    <span className="bg-slate-100 text-slate-600 px-4 py-1.5 rounded-full text-sm font-bold">
                      총 {lineupData[selectedTeam].length}명
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {(() => {
                    const groups: Record<string, any[]> = { 
                      '포수': [], '내야수': [], '외야수': [] 
                    };
                    
                    lineupData[selectedTeam].forEach((p: any) => {
                      const pos = p.position || '';
                      if (pos.includes('포수')) {
                        groups['포수'].push(p);
                      } else if (pos.includes('익수') || pos.includes('견수') || pos.includes('외야')) {
                        groups['외야수'].push(p);
                      } else {
                        groups['내야수'].push(p);
                      }
                    });

                    return Object.entries(groups).map(([groupName, groupPlayers]) => {
                      const sortedPlayers = sortPlayers(groupPlayers);

                      return (
                        <div key={groupName} className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                          <h3 className="text-base font-extrabold text-slate-700 mb-4 flex items-center gap-2">
                            {groupName} 
                            <span className="bg-white border border-slate-200 px-2 py-0.5 rounded-full text-xs font-bold text-slate-400">
                              {sortedPlayers.length}
                            </span>
                          </h3>
                          <ul className="space-y-3">
                            {sortedPlayers.map((player: any) => (
                              <li 
                                key={player.pcode} 
                                onClick={() => openPlayerModal(player)}
                                className="flex justify-between items-center p-3.5 bg-white rounded-xl cursor-pointer hover:border-blue-400 border border-transparent shadow-sm hover:shadow transition-all overflow-hidden"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span className="font-bold text-slate-800 text-base truncate flex-shrink-0">{player.name}</span>
                                  <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                                    {player.position || '선수'}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                                  <span className="text-xs font-bold text-slate-400 font-mono flex-shrink-0">
                                    {sortType === 'ops' ? `OPS ${player.seasonOps}` : 
                                     sortType === 'avg' ? `AVG ${player.seasonAvg}` : ''}
                                  </span>
                                  
                                  {player.backNumber != null && (
                                    <div className="text-slate-400 font-mono text-xs font-bold bg-slate-50 px-2 py-1 rounded-md min-w-[42px] text-center flex-shrink-0">
                                      No.{player.backNumber}
                                    </div>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                          {sortedPlayers.length === 0 && (
                            <div className="text-sm text-slate-400 text-center py-4 font-medium">
                              선수가 없습니다.
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4 transition-opacity">
          
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm cursor-pointer" onClick={closeModal}></div>
          
          <div className="relative bg-white rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.2)] border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
            
            <div className="p-6 border-b bg-slate-50 relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="pr-10 flex items-center gap-4">
                <img 
                  src={getTeamLogo(selectedPlayer.teamCode)} 
                  alt="팀 로고" 
                  className="w-12 h-12 object-contain"
                />
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    {selectedPlayer.name}
                    {selectedPlayer.backNumber != null && (
                      <span className="text-sm font-medium bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-full">
                        No.{selectedPlayer.backNumber}
                      </span>
                    )}
                  </h3>
                  <p className="text-slate-500 text-sm mt-1">{selectedPlayer.teamName} · {selectedPlayer.position || '타자'}</p>
                </div>
              </div>
              
              <div className="flex flex-col bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-sm mr-2 md:mr-8 min-w-[280px]">
                <div className="flex justify-between gap-4 border-b border-slate-100 pb-2 mb-2">
                  <div className="text-center w-1/4">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">타율</div>
                    <div className="text-sm font-extrabold text-slate-700 mt-0.5">{selectedPlayer.seasonAvg}</div>
                  </div>
                  <div className="text-center w-1/4">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">출루율</div>
                    <div className="text-sm font-extrabold text-slate-700 mt-0.5">{selectedPlayer.seasonObp}</div>
                  </div>
                  <div className="text-center w-1/4">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">장타율</div>
                    <div className="text-sm font-extrabold text-slate-700 mt-0.5">{selectedPlayer.seasonSlg}</div>
                  </div>
                  <div className="text-center w-1/4">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">OPS</div>
                    <div className="text-sm font-extrabold text-red-600 mt-0.5">{selectedPlayer.seasonOps}</div>
                  </div>
                </div>
                <div className="flex justify-around gap-2">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">안타</div>
                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedPlayer.seasonHit}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">홈런</div>
                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedPlayer.seasonHr}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-400 font-bold tracking-wider">타점</div>
                    <div className="text-xs font-bold text-slate-700 mt-0.5">{selectedPlayer.seasonRbi}</div>
                  </div>
                </div>
              </div>

              <button 
                onClick={closeModal} 
                className="absolute top-4 right-4 text-slate-400 hover:text-red-500 text-3xl font-bold w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 bg-slate-100 custom-scrollbar space-y-6">
              
              {!modalLoading && atBats.length > 0 && (
                <div className={`bg-white p-5 rounded-xl shadow-sm flex flex-col gap-4 font-mono border-2 ${getTeamBorder(selectedPlayer.teamCode)}`}>
                  <div className="flex justify-between items-center px-2">
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">최근 {atBats.length}타석 기록</span>
                  </div>
                  <div className="grid grid-cols-4 divide-x divide-slate-200 text-center border-t border-slate-100 pt-3">
                    <div>
                      <div className="text-[11px] text-slate-500 font-bold">타율</div>
                      <div className="text-2xl font-extrabold text-slate-800 mt-1">{stats.avg}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 font-bold">출루율</div>
                      <div className="text-2xl font-extrabold text-blue-600 mt-1">{stats.obp}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 font-bold">장타율</div>
                      <div className="text-2xl font-extrabold text-green-600 mt-1">{stats.slg}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 font-bold">OPS</div>
                      <div className="text-2xl font-extrabold text-red-600 mt-1">{stats.ops}</div>
                    </div>
                  </div>
                  
                  <div className="border-t border-slate-100"></div>

                  <div className="grid grid-cols-5 text-center text-sm">
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold">타수</div>
                      <div className="font-semibold text-slate-700">{stats.ab}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold">안타</div>
                      <div className="font-semibold text-slate-700">{stats.h}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold">홈런</div>
                      <div className="font-semibold text-slate-700">{stats.hr}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold">사사구</div>
                      <div className="font-semibold text-slate-700">{stats.bb}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold">삼진</div>
                      <div className="font-semibold text-slate-700">{stats.k}</div>
                    </div>
                  </div>
                </div>
              )}

              {modalLoading ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
                </div>
              ) : atBats.length === 0 ? (
                <div className="text-center text-slate-500 py-10 bg-white rounded-xl border">최근 타석 기록을 불러오지 못했거나 경기가 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {atBats.map((ab, idx) => {
                    const bases = [];
                    if (ab.base1) bases.push("1루");
                    if (ab.base2) bases.push("2루");
                    if (ab.base3) bases.push("3루");
                    const baseText = bases.length > 0 ? bases.join(", ") : "주자 없음";

                    return (
                      <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between min-h-[140px]">
                        
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-blue-100">
                              {formatDate(ab.gameDate)}
                            </span>
                            <span className="text-xs text-slate-500 font-semibold">{ab.inning}회 vs {ab.opponent}</span>
                          </div>
                          
                          <div className="text-lg font-extrabold text-slate-800 leading-tight mb-1">
                            {cleanResultText(ab.resultText, selectedPlayer.name)}
                          </div>
                          
                          <div className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                            <span className="text-red-500 font-bold">{ab.outCount}아웃</span>
                            <span className="text-slate-300">|</span>
                            <span>{baseText}</span>
                          </div>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                          <div className="flex justify-between font-medium">
                            <span>투수: <span className="text-slate-800 font-semibold">{ab.pitcherName || "-"}</span></span>
                            <span className="text-blue-600 font-semibold">{ab.pitchCount}구</span>
                          </div>
                          {ab.lastPitchSpeed && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {ab.lastPitchSpeed}km/h · {ab.lastPitchType}
                            </div>
                          )}
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
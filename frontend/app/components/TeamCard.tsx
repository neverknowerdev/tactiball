import React from "react";
import { useCountryFlag } from "../hooks/useCountryFlag";
import { formatElo } from "../hooks/formatting";

interface TeamCardProps {
  teamInfo: any;
  onOpenSettings: () => void;
}

export function TeamCard({ teamInfo, onOpenSettings }: TeamCardProps) {
  const getCountryFlag = useCountryFlag();

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xl font-bold text-black">{teamInfo.name}</h2>
        <button
          onClick={onOpenSettings}
          className="text-gray-600 hover:text-gray-800 transition-colors"
          title="Team settings"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="flex items-start gap-4">
        {/* Shield logo */}
        <div className="h-16 w-16 bg-yellow-400 rounded-lg border-2 border-black flex items-center justify-center">
          <div className="text-black text-lg font-bold">{teamInfo.name?.substring(0, 2).toUpperCase() || 'TM'}</div>
        </div>
        <div className="flex-1 flex justify-between items-start">
          {/* Left side: League and matches */}
          <div>
            {/* First line: Global team stats - always show */}
            <div className="text-sm text-black mb-1">
              <span title="Matches">M:{teamInfo.leaderboard?.alltime?.total_games || 0}</span>{' '}
              <span title="Wins" className="text-green-600">W:{teamInfo.leaderboard?.alltime?.wins || 0}</span>{' '}
              <span title="Draws">D:{teamInfo.leaderboard?.alltime?.draws || 0}</span>{' '}
              <span title="Losses" className="text-red-600">L:{teamInfo.leaderboard?.alltime?.losses || 0}</span>
            </div>
            {/* Second line: Last 5 game results visually */}
            <div className="flex items-center gap-1 mb-1">
              {(!teamInfo.last_games || teamInfo.last_games.length === 0 || (teamInfo.leaderboard?.alltime?.total_games || 0) === 0) ? (
                <span className="text-sm text-gray-600">no games played yet</span>
              ) : (
                <>
                  <span className="text-sm text-black mr-1">Form:</span>
                  {teamInfo.last_games.map((result: string, i: number) => {
                    const getColor = (result: string) => {
                      switch (result) {
                        case 'VICTORY':
                          return 'bg-green-600';
                        case 'DRAW':
                          return 'bg-yellow-500';
                        case 'DEFEAT':
                        case 'DEFEAT_BY_TIMEOUT':
                          return 'bg-red-600';
                        default:
                          return 'bg-gray-400';
                      }
                    };
                    return (
                      <span
                        key={i}
                        className={`h-3 w-3 rounded-full ${getColor(result)}`}
                        title={result}
                      />
                    );
                  })}
                </>
              )}
            </div>
            {/* Third line: Team age */}
            <div className="text-sm text-black mb-3">
              {teamInfo.team_age === 0 ? "just created" : `${teamInfo.team_age} days old`}
            </div>

            {/* Active game indicator */}
            {teamInfo.active_game_id && (
              <div className="mt-2">
                <div className="inline-flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span>Active Game #{teamInfo.active_game_id}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right side: ELO and Ranking */}
          <div className="flex flex-col items-end gap-2">
            <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">ELO {formatElo(teamInfo.elo_rating)}</span>
            <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded" title={`Position: ${teamInfo.league_position}th in ${teamInfo.country} / ${teamInfo.global_position}th globally`}>
              {teamInfo.league_position}th {getCountryFlag(teamInfo.country_index)} / {teamInfo.global_position}th 🌍
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import React from "react";
import { Identity, Avatar, Name } from "@coinbase/onchainkit/identity";
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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
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
        <div className="flex-1">
          <div className="flex justify-between items-start mb-2">
            <h2 className="text-xl font-bold text-black">{teamInfo.name}</h2>
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">ELO {formatElo(teamInfo.elo_rating)}</span>
            </div>
          </div>

          {/* Player info */}
          <div className="flex justify-between items-center mb-2">
            <Identity className="bg-white px-0 space-x-1 team-coach-username">
              <Avatar className="w-6 h-6" />
              <Name className="text-black ml-0" />
            </Identity>
            <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded" title={`Position: ${teamInfo.league_position}th in ${teamInfo.country} / ${teamInfo.global_position}th globally`}>
              {teamInfo.league_position}th {getCountryFlag(teamInfo.country_index)} / {teamInfo.global_position}th 🌍
            </div>
          </div>

          {/* League and matches */}
          <div className="text-sm text-black">
            {teamInfo.matchesPlayed} matches played · {teamInfo.team_age === 0 ? "just created" : `${teamInfo.team_age} days old`}
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
      </div>
    </div>
  );
}
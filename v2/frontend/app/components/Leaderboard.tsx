"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { api, errorText, formatElo, Outcome, type TeamView } from '@/lib/backend';
import { countryFlag, countryName } from '@/lib/countries';
import { ChainBadge } from './ChainBadge';

interface LeaderboardProps {
    limit?: number;
    userTeam?: TeamView | null;
}

const FORM_COLOR: Record<Outcome, string> = {
    [Outcome.Win]: 'bg-green-600',
    [Outcome.Draw]: 'bg-gray-400',
    [Outcome.Loss]: 'bg-red-600',
};

function Form({ form }: { form: Outcome[] }) {
    return (
        <div className="flex gap-1 items-center">
            {form.map((result, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${FORM_COLOR[result]}`} title={result} />
            ))}
        </div>
    );
}

// One leaderboard for every chain; the badge shows where each team plays from.
export function Leaderboard({ limit = 50, userTeam }: LeaderboardProps) {
    const [teams, setTeams] = useState<TeamView[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const fetchLeaderboard = useCallback(async () => {
        try {
            setTeams(await api().leaderboard(0n, BigInt(limit)));
            setError(null);
        } catch (err) {
            setError(`Failed to fetch leaderboard: ${errorText(err)}`);
        }
    }, [limit]);

    useEffect(() => {
        fetchLeaderboard();
        const t = setInterval(fetchLeaderboard, 30_000);
        return () => clearInterval(t);
    }, [fetchLeaderboard]);

    const visible = teams ? (showAll ? teams : teams.slice(0, 10)) : [];
    const userInList = !!userTeam && !!teams?.some((t) => t.id === userTeam.id);

    const row = (team: TeamView, pos: string, className: string) => (
        <tr key={String(team.id)} className={className}>
            <td className="py-2 pr-2">{pos}</td>
            <td className="py-2 pr-2">
                <span className="font-medium mr-1">{team.name}</span>
                <span className="text-base cursor-help mr-1" title={countryName(team.country)}>
                    {countryFlag(team.country)}
                </span>
                <ChainBadge chain={team.home_chain} />
            </td>
            <td className="py-2 pr-2 text-center">{String(team.games)}</td>
            <td className="py-2 pr-2 text-center text-green-600 font-medium">{String(team.wins)}</td>
            <td className="py-2 pr-2 text-center">{String(team.draws)}</td>
            <td className="py-2 pr-2 text-center text-red-600 font-medium">{String(team.losses)}</td>
            <td className="py-2 pr-2 hidden sm:table-cell">
                <Form form={team.form} />
            </td>
            <td className="py-2 pr-2 text-right font-medium">{formatElo(team.elo)}</td>
        </tr>
    );

    return (
        <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 relative">
            {!teams && !error && (
                <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                    <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                </div>
            )}
            <div className="p-4">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-semibold">Leaderboard 🌍</h3>
                    <span className="text-sm text-gray-500">All chains · All time</span>
                </div>
                <table className="w-full text-sm text-left">
                    <thead className="text-gray-600">
                        <tr className="border-b">
                            <th className="py-2 pr-2">Pos</th>
                            <th className="py-2 pr-2">Team</th>
                            <th className="py-2 pr-2 text-center" title="Matches">M</th>
                            <th className="py-2 pr-2 text-center" title="Wins">W</th>
                            <th className="py-2 pr-2 text-center" title="Draws">D</th>
                            <th className="py-2 pr-2 text-center" title="Losses">L</th>
                            <th className="py-2 pr-2 hidden sm:table-cell">Form</th>
                            <th className="py-2 pr-2 text-right">ELO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {error ? (
                            <tr>
                                <td colSpan={8} className="py-4 text-center text-red-500">{error}</td>
                            </tr>
                        ) : !teams ? (
                            <tr>
                                <td colSpan={8} className="py-4 text-center text-gray-500">Loading leaderboard...</td>
                            </tr>
                        ) : (
                            <>
                                {userTeam && !userInList && row(userTeam, '—', 'bg-green-50 border-b-2 border-green-200')}
                                {visible.length > 0 ? (
                                    visible.map((team, index) =>
                                        row(
                                            team,
                                            String(index + 1),
                                            userTeam && team.id === userTeam.id
                                                ? 'bg-green-50 border-b-2 border-green-200'
                                                : index === 0
                                                    ? 'bg-yellow-50'
                                                    : 'border-t',
                                        ),
                                    )
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="py-4 text-center text-gray-500">No teams yet. Be the first!</td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
                {teams && teams.length > 10 && (
                    <div className="flex justify-center mt-3">
                        <button
                            className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                            onClick={() => setShowAll(!showAll)}
                        >
                            {showAll ? 'Show Less' : 'Show More'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

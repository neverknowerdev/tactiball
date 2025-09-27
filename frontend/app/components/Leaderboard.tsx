"use client";

import React, { useState, useEffect, useCallback } from 'react';
import countryList from '../../public/countryList.json';

interface LeaderboardEntry {
    team_id: number;
    team_name: string;
    country: number;
    elo_rating: number;
    global_rank: number;
    country_rank: number;
    total_games: number;
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    elo_rating_delta: number;
    goal_difference: number;
    win_percentage: number;
    last_games?: string[];
}

interface LeaderboardData {
    global_leaderboard: LeaderboardEntry[];
    country_leaderboard?: LeaderboardEntry[];
    period: string;
    period_start: string;
}

interface UserLeaderboardData {
    alltime: Partial<LeaderboardEntry>;
    month: Partial<LeaderboardEntry>;
    week: Partial<LeaderboardEntry>;
}

interface LeaderboardProps {
    period?: string;
    limit?: number;
    countryIndex?: number;
    userLeaderboardData?: UserLeaderboardData;
    userTeamInfo?: {
        id: number;
        name: string;
        country_index: number;
        elo_rating: number;
    };
    onViewFull?: () => void;
}

export function Leaderboard({ period = 'month', limit = 5, countryIndex, userLeaderboardData, userTeamInfo }: LeaderboardProps) {
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAll, setShowAll] = useState(false);

    const countryFlagCache = React.useMemo(() => new Map<number, string>(), []);

    // Local storage cache key
    const getCacheKey = () => `leaderboard_${period}_${countryIndex || 'global'}`;

    // Load data from local storage
    const loadFromCache = (): LeaderboardData | null => {
        try {
            const cached = localStorage.getItem(getCacheKey());
            if (cached) {
                const parsed = JSON.parse(cached);
                // Check if cache is not too old (5 minutes)
                const cacheAge = Date.now() - (parsed.timestamp || 0);
                if (cacheAge < 5 * 60 * 1000) {
                    return parsed.data;
                }
            }
        } catch (error) {
            console.error('Error loading from cache:', error);
        }
        return null;
    };

    // Save data to local storage
    const saveToCache = (data: LeaderboardData) => {
        try {
            const cacheData = {
                data,
                timestamp: Date.now()
            };
            localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
        } catch (error) {
            console.error('Error saving to cache:', error);
        }
    };

    // Fetch leaderboard data
    const fetchLeaderboard = useCallback(async () => {
        // First, try to load from cache
        const cachedData = loadFromCache();
        if (cachedData) {
            setData(cachedData);
            setLoading(false);
        } else {
            setLoading(true);
        }

        setError(null);
        setUpdating(true);

        try {
            const params = new URLSearchParams({
                period,
                limit: limit.toString(),
                ...(countryIndex && { country_index: countryIndex.toString() })
            });

            const response = await fetch(`/api/get-leaderboard?${params}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('leaderboardData', result);

            if (result.success) {
                setData(result.data);
                saveToCache(result.data);
            } else {
                setError(result.error || 'Failed to fetch leaderboard data');
            }
        } catch (err) {
            console.error('Error fetching leaderboard:', err);
            setError('Failed to fetch leaderboard data');
        } finally {
            setLoading(false);
            setUpdating(false);
        }
    }, [period, limit, countryIndex]);

    // Fetch data on mount and when dependencies change
    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    // Helper function to format ELO rating from 1000 format to 10.00 format
    const formatElo = (elo: number): string => {
        return (elo / 100).toFixed(2);
    };

    // Get user's team data for the current period
    const getUserTeamData = (): LeaderboardEntry | null => {
        if (!userTeamInfo) {
            return null;
        }

        if (!userLeaderboardData) {
            return null;
        }

        const periodData = userLeaderboardData[period as keyof UserLeaderboardData];

        if (!periodData) {
            return null;
        }

        // Create a complete LeaderboardEntry by combining team info with period statistics
        const userTeamData: LeaderboardEntry = {
            team_id: userTeamInfo.id,
            team_name: userTeamInfo.name,
            country: userTeamInfo.country_index,
            elo_rating: userTeamInfo.elo_rating,
            global_rank: periodData.global_rank || 0,
            country_rank: periodData.country_rank || 0,
            total_games: periodData.total_games || 0,
            wins: periodData.wins || 0,
            draws: periodData.draws || 0,
            losses: periodData.losses || 0,
            goals_scored: periodData.goals_scored || 0,
            goals_conceded: periodData.goals_conceded || 0,
            elo_rating_delta: periodData.elo_rating_delta || 0,
            goal_difference: periodData.goal_difference || 0,
            win_percentage: periodData.win_percentage || 0,
            last_games: periodData.last_games || []
        };

        return userTeamData;
    };

    // Check if user's team is already in the top 5 of the leaderboard
    const isUserTeamInTop5 = (): boolean => {
        if (!userTeamInfo || !data?.global_leaderboard) {
            return false;
        }

        return data.global_leaderboard.some(team => team.team_id === userTeamInfo.id);
    };

    // Get teams to display based on showAll state
    const getTeamsToDisplay = (): LeaderboardEntry[] => {
        if (!data?.global_leaderboard) return [];

        if (showAll) {
            return data.global_leaderboard;
        }

        return data.global_leaderboard.slice(0, 10);
    };

    // Check if we should show the "Show More" button
    const shouldShowMoreButton = (): boolean => {
        return Boolean(data?.global_leaderboard && data.global_leaderboard.length > 10);
    };

    // Helper function to get country flag emoji
    const getCountryFlag = (countryIndex: number) => {
        // Check cache first
        if (countryFlagCache.has(countryIndex)) {
            return countryFlagCache.get(countryIndex)!;
        }

        // Find the country by index in the country list
        const country = countryList.find(c => c.index === countryIndex);

        if (country && country.code) {
            // Convert country code to flag emoji using Unicode regional indicator symbols
            const codePoints = country.code
                .toUpperCase()
                .split('')
                .map(char => char.charCodeAt(0) + 127397); // 127397 is the offset from 'A' to 🇦

            const flag = String.fromCodePoint(...codePoints);

            // Cache the result
            countryFlagCache.set(countryIndex, flag);

            return flag;
        }

        // Fallback for invalid country index
        const fallback = `#${countryIndex}`;
        countryFlagCache.set(countryIndex, fallback);
        return fallback;
    };

    const getPeriodDisplayName = (period: string) => {
        switch (period) {
            case 'week':
                return 'This Week';
            case 'month':
                return new Date().toLocaleDateString('en-US', { month: 'long' });
            case 'alltime':
            default:
                return 'All Time';
        }
    };

    return (
        <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 relative">
            {loading && (
                <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                    <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                </div>
            )}
            <div className="p-4">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold">Leaderboard 🌍</h3>
                        {updating && (
                            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                                <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                            </div>
                        )}
                    </div>
                    <span className="text-lg text-gray-500">
                        {data ? getPeriodDisplayName(data.period) : 'All Time'}
                    </span>
                </div>
                <table className={`w-full text-sm text-left transition-opacity duration-200 ${updating ? 'opacity-75' : 'opacity-100'}`}>
                    <thead className="text-gray-600">
                        <tr className="border-b">
                            <th className="py-2 pr-2">Pos</th>
                            <th className="py-2 pr-2">Team</th>
                            <th className="py-2 pr-2 text-center" title="Matches">M</th>
                            <th className="py-2 pr-2 text-center" title="Wins">W</th>
                            <th className="py-2 pr-2 text-center" title="Draws">D</th>
                            <th className="py-2 pr-2 text-center" title="Losses">L</th>
                            <th className="py-2 pr-2 hidden sm:table-cell">Form</th>
                            <th className="py-2 pr-2 text-right">EloΔ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="py-4 text-center text-gray-500">
                                    Loading leaderboard...
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={8} className="py-4 text-center text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : (
                            <>
                                {/* User's team row - show first if available and not in top 5 */}
                                {getUserTeamData() && !isUserTeamInTop5() && (
                                    <tr className="bg-green-50 border-b-2 border-green-200">
                                        <td className="py-2 pr-2">—</td>
                                        <td className="py-2 pr-2">
                                            <span className="font-medium mr-2">{getUserTeamData()!.team_name}</span>
                                            <span
                                                className="text-base cursor-help"
                                                title={countryList.find(c => c.index === getUserTeamData()!.country)?.name || `Country #${getUserTeamData()!.country}`}
                                            >
                                                {getCountryFlag(getUserTeamData()!.country)}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-2 text-center">{getUserTeamData()!.total_games}</td>
                                        <td className="py-2 pr-2 text-center text-green-600 font-medium">{getUserTeamData()!.wins}</td>
                                        <td className="py-2 pr-2 text-center">{getUserTeamData()!.draws}</td>
                                        <td className="py-2 pr-2 text-center text-red-600 font-medium">{getUserTeamData()!.losses}</td>
                                        <td className="py-2 pr-2 hidden sm:table-cell">
                                            <div className="flex gap-1 items-center">
                                                {getUserTeamData()!.last_games?.slice(0, 5).map((result: string, i: number) => (
                                                    <span
                                                        key={i}
                                                        className={`h-2 w-2 rounded-full ${result === 'VICTORY' ? 'bg-green-600' :
                                                            result === 'DEFEAT' ? 'bg-red-600' : 'bg-gray-400'
                                                            }`}
                                                    />
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-2 pr-2 text-right font-medium">
                                            {getUserTeamData()!.elo_rating_delta > 0 ? '+' : ''}{formatElo(getUserTeamData()!.elo_rating_delta || 0)}
                                        </td>
                                    </tr>
                                )}

                                {/* Regular leaderboard data */}
                                {getTeamsToDisplay().length > 0 ? (
                                    getTeamsToDisplay().map((team, index) => {
                                        const countryInfo = countryList.find(c => c.index === team.country);
                                        const isUserTeam = userTeamInfo && team.team_id === userTeamInfo.id;
                                        return (
                                            <tr key={team.team_id} className={
                                                isUserTeam
                                                    ? "bg-green-50 border-b-2 border-green-200"
                                                    : index === 0
                                                        ? "bg-yellow-50"
                                                        : "border-t"
                                            }>
                                                <td className="py-2 pr-2">{team.global_rank}</td>
                                                <td className="py-2 pr-2">
                                                    <span className="font-medium mr-2">{team.team_name}</span>
                                                    <span
                                                        className="text-base cursor-help"
                                                        title={countryInfo?.name || `Country #${team.country}`}
                                                    >
                                                        {getCountryFlag(team.country)}
                                                    </span>
                                                </td>
                                                <td className="py-2 pr-2 text-center">{team.total_games}</td>
                                                <td className="py-2 pr-2 text-center text-green-600 font-medium">{team.wins}</td>
                                                <td className="py-2 pr-2 text-center">{team.draws}</td>
                                                <td className="py-2 pr-2 text-center text-red-600 font-medium">{team.losses}</td>
                                                <td className="py-2 pr-2 hidden sm:table-cell">
                                                    <div className="flex gap-1 items-center">
                                                        {team.last_games?.slice(0, 5).map((result: string, i: number) => (
                                                            <span
                                                                key={i}
                                                                className={`h-2 w-2 rounded-full ${result === 'VICTORY' ? 'bg-green-600' :
                                                                    result === 'DEFEAT' ? 'bg-red-600' : 'bg-gray-400'
                                                                    }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="py-2 pr-2 text-right font-medium">
                                                    {team.elo_rating_delta > 0 ? '+' : ''}{formatElo(team.elo_rating_delta)}
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="py-4 text-center text-gray-500">
                                            No leaderboard data available
                                        </td>
                                    </tr>
                                )}
                            </>
                        )}
                    </tbody>
                </table>
                <div className="flex justify-center mt-3">
                    {shouldShowMoreButton() && (
                        <button
                            className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                            onClick={() => setShowAll(!showAll)}
                        >
                            {showAll ? 'Show Less' : 'Show More'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

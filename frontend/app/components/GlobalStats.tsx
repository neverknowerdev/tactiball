"use client";

import React, { useState, useEffect, useCallback } from 'react';

interface GlobalStatsData {
    total_teams: number;
    total_games: number;
    total_events: number;
    formatted?: {
        total_teams: string;
        total_games: string;
        total_events: string;
    };
}

interface GlobalStatsProps {
    className?: string;
}

export function GlobalStats({ className = "" }: GlobalStatsProps) {
    const [globalStats, setGlobalStats] = useState<GlobalStatsData | null>(null);
    const [loading, setLoading] = useState(false);
    const [updating, setUpdating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // In-memory cache
    let cachedData: { data: GlobalStatsData; timestamp: number } | null = null;

    // Load data from cache
    const loadFromCache = (): GlobalStatsData | null => {
        if (cachedData) {
            // Check if cache is not too old (10 minutes)
            const cacheAge = Date.now() - cachedData.timestamp;
            if (cacheAge < 10 * 60 * 1000) {
                return cachedData.data;
            }
        }
        return null;
    };

    // Save data to cache
    const saveToCache = (data: GlobalStatsData) => {
        cachedData = {
            data,
            timestamp: Date.now()
        };
    };

    // Fetch global stats
    const fetchGlobalStats = useCallback(async () => {
        // First, try to load from cache
        const cached = loadFromCache();
        if (cached) {
            setGlobalStats(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        setError(null);
        setUpdating(true);

        try {
            const response = await fetch('/api/get-global-stat');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('globalStats', data);

            if (data.success) {
                setGlobalStats(data.data);
                saveToCache(data.data);
            } else {
                setError(data.error || 'Failed to fetch global statistics');
            }
        } catch (err) {
            console.error('Error fetching global stats:', err);
            setError('Failed to fetch global statistics');
        } finally {
            setLoading(false);
            setUpdating(false);
        }
    }, []);

    // Fetch data on mount
    useEffect(() => {
        fetchGlobalStats();
    }, [fetchGlobalStats]);

    if (loading) {
        return (
            <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
                <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                    <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Teams</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Games</div>
                        </div>
                        <div className="text-center">
                            <div className="text-2xl font-bold text-gray-400">—</div>
                            <div className="text-xs text-gray-600">Transactions</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
                <div className="p-4">
                    <div className="text-center text-red-500 text-sm">
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
            <div className="p-4">
                {updating && (
                    <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden mb-4">
                        <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                    </div>
                )}
                <div className={`grid grid-cols-3 gap-4 transition-opacity duration-200 ${updating ? 'opacity-75' : 'opacity-100'}`}>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">
                            {globalStats?.formatted?.total_teams || globalStats?.total_teams || 0}
                        </div>
                        <div className="text-xs text-gray-600">Teams</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">
                            {globalStats?.formatted?.total_games || globalStats?.total_games || 0}
                        </div>
                        <div className="text-xs text-gray-600">Games</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-bold animate-number">
                            {globalStats?.formatted?.total_events || globalStats?.total_events || 0}
                        </div>
                        <div className="text-xs text-gray-600">Transactions</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
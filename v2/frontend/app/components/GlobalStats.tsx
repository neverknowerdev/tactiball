"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { api, errorText, type GlobalStats as Stats } from '@/lib/backend';

interface GlobalStatsProps {
    className?: string;
}

export function GlobalStats({ className = "" }: GlobalStatsProps) {
    const [stats, setStats] = useState<Stats | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchGlobalStats = useCallback(async () => {
        try {
            setStats(await api().global_stats());
            setError(null);
        } catch (err) {
            setError(`Failed to fetch global statistics: ${errorText(err)}`);
        }
    }, []);

    useEffect(() => {
        fetchGlobalStats();
        const t = setInterval(fetchGlobalStats, 30_000);
        return () => clearInterval(t);
    }, [fetchGlobalStats]);

    if (error) {
        return (
            <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
                <div className="p-4">
                    <div className="text-center text-red-500 text-sm">{error}</div>
                </div>
            </div>
        );
    }

    const cell = (value: bigint | undefined, label: string) => (
        <div className="text-center">
            <div className={`text-2xl font-bold ${stats ? 'animate-number' : 'text-gray-400'}`}>
                {value !== undefined ? Number(value).toLocaleString('en-US') : '—'}
            </div>
            <div className="text-xs text-gray-600">{label}</div>
        </div>
    );

    return (
        <div className={`w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200 ${className}`}>
            {!stats && (
                <div className="h-0.5 bg-gray-200 rounded-t-lg overflow-hidden">
                    <div className="h-full bg-blue-500 animate-pulse-loading"></div>
                </div>
            )}
            <div className="p-4">
                <div className="grid grid-cols-3 gap-4">
                    {cell(stats?.teams, 'Teams')}
                    {cell(stats?.games, 'Games')}
                    {cell(stats?.active_games, 'Live now')}
                </div>
            </div>
        </div>
    );
}

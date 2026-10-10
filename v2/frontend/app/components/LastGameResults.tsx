import React from 'react';

interface GameResult {
    result: string;
    id?: string;
    createdAt?: string;
    status?: string;
    score?: number;
}

interface LastGameResultsProps {
    lastGames: (GameResult | string)[];
}

/**
 * Component that renders form indicators for the last games results
 * Shows colored circles representing W (Win), D (Draw), L (Loss)
 */
export function LastGameResults({ lastGames }: LastGameResultsProps): React.ReactNode {
    if (!lastGames || lastGames.length === 0) {
        return <span className="text-gray-400 text-sm">No games</span>;
    }

    return (
        <div className="flex gap-1 items-center">
            {lastGames.slice(0, 5).map((game, index) => {
                // Handle both string and object formats
                const result = typeof game === 'string' ? game : game.result;
                const gameId = typeof game === 'object' ? game.id : undefined;

                const getIndicatorColor = (result: string) => {
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

                const getIndicatorLetter = (result: string) => {
                    switch (result) {
                        case 'VICTORY':
                            return 'W';
                        case 'DRAW':
                            return 'D';
                        case 'DEFEAT':
                        case 'DEFEAT_BY_TIMEOUT':
                            return 'L';
                        default:
                            return '?';
                    }
                };

                return (
                    <span
                        key={gameId || index}
                        className={`h-2 w-2 rounded-full ${getIndicatorColor(result)}`}
                        title={`${getIndicatorLetter(result)} - ${result}`}
                    />
                );
            })}
        </div>
    );
}

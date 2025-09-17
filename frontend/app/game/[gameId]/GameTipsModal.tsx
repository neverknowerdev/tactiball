'use client';

import React from 'react';
import { TeamEnum } from '@/lib/game';
import { useOpenUrl } from '@coinbase/onchainkit/minikit';

interface GameTipsModalProps {
    isOpen: boolean;
    onClose: () => void;
    isConnected: boolean;
    currentTeam: any; // Team | null
}

export default function GameTipsModal({ isOpen, onClose, isConnected, currentTeam }: GameTipsModalProps) {
    const openUrl = useOpenUrl();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-in fade-in duration-300"
            onClick={onClose}>
            <div className="bg-white rounded-lg p-6 shadow-2xl max-w-2xl mx-4 animate-in zoom-in-95 duration-300"
                onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Quick Game Tips</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="space-y-3 text-sm text-gray-700">
                    {!isConnected && (
                        <div className="flex items-start gap-2">
                            <span className="font-semibold text-red-600">0.</span>
                            <span>Connect wallet first by clicking on "Connect Wallet"</span>
                        </div>
                    )}
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">1.</span>
                        <span>
                            {isConnected && currentTeam ? (
                                <>Your team: <span className="font-semibold text-gray-800">{currentTeam.enum === TeamEnum.TEAM1 ? 'team1' : 'team2'}</span> (<span className={`font-semibold ${currentTeam.enum === TeamEnum.TEAM1 ? 'text-blue-600' : 'text-red-600'}`}>{currentTeam.enum === TeamEnum.TEAM1 ? 'blue' : 'red'}</span>)</>
                            ) : (
                                <>You play for one of the team: <span className="font-semibold text-gray-800">team1</span> (<span className="font-semibold text-blue-600">blue</span>) or <span className="font-semibold text-gray-800">team2</span> (<span className="font-semibold text-red-600">red</span>)</>
                            )}
                        </span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">2.</span>
                        <span>Click your player → select move type → click highlighted cell to move player and/or ball</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">3.</span>
                        <span>Click on player to switch his action in circle: <span className="font-semibold text-orange-600">Run</span> → <span className="font-semibold text-blue-600">Pass/Shot</span> → <span className="font-semibold text-red-600">Tackle</span></span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">4.</span>
                        <span><span className="font-semibold text-orange-600">Run</span> and <span className="font-semibold text-red-600">Tackle</span> actions available for every player. <span className="font-semibold text-blue-600">Pass/Shot</span> available for players with ball.</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">5.</span>
                        <span>Moved players are more transparent. Click on them again to undo</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">6.</span>
                        <span>Move at least 1 player(or all 6), then click "Ready"</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">7.</span>
                        <span>Wait for opponent move, and new board position calculated by game engine. And make a new move</span>
                    </div>
                    <div className="flex items-start gap-2">
                        <span className="font-semibold text-blue-600">8.</span>
                        <span>30 seconds per move, 45 moves total</span>
                    </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200">
                    <button
                        onClick={() => openUrl(`${window.location.origin}/rules-of-game`)}
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 underline transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Full Rules
                    </button>
                </div>
            </div>
        </div>
    );
}

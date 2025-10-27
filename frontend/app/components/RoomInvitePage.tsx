"use client";

import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
    ConnectWallet,
    Wallet,
    WalletDropdown,
    WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import {
    Name,
    Identity,
    Address,
    Avatar,
    EthBalance,
} from "@coinbase/onchainkit/identity";
import { useAccount } from "wagmi";
import React, { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

interface RoomInviteContentProps {
    roomId: string;
}

function RoomInviteContent({ roomId }: RoomInviteContentProps) {
    const { setFrameReady, isFrameReady, context } = useMiniKit();
    const { address, isConnected } = useAccount();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [roomData, setRoomData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [continueInWeb, setContinueInWeb] = useState(false);

    const isMiniApp = useMemo(() => {
        return context !== null && context !== undefined;
    }, [context]);

    // Fetch room details
    useEffect(() => {
        const fetchRoom = async () => {
            try {
                const response = await fetch(`/api/waiting-rooms/${roomId}`);
                const data = await response.json();

                if (data.success) {
                    setRoomData(data.room);
                }
            } catch (error) {
                console.error('Error fetching room:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchRoom();
    }, [roomId]);

    // Redirect to lobby when connected
    useEffect(() => {
        if (isConnected && address && roomData && isMiniApp) {
            // Redirect to the main app with room selection
            router.push(`/?room=${roomId}`);
        }
    }, [isConnected, address, roomData, isMiniApp, roomId, router]);

    useEffect(() => {
        if (!isFrameReady) {
            setFrameReady();
        }
    }, [setFrameReady, isFrameReady]);

    const baseAppUrl = useMemo(() => {
        if (typeof window === "undefined") return "";
        const appUrl = `https://play.tactiball.fun/room/${roomId}`;
        return `cbwallet://miniapp?url=${encodeURIComponent(appUrl)}`;
    }, [roomId]);

    const farcasterMiniAppUrl = useMemo(() => {
        if (typeof window === "undefined") return "";
        const appId = "uOFpcGpLFeLD";
        const appSlug = "tactiball";
        return `https://farcaster.xyz/miniapps/${appId}/${appSlug}/room/${roomId}`;
    }, [roomId]);

    const formatElo = (elo: number) => (elo / 100).toFixed(2);

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center mini-app-theme">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            </div>
        );
    }

    if (!isMiniApp && !continueInWeb) {
        return (
            <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
                {/* Wallet in top right */}
                <div className="absolute top-4 right-4 z-20">
                    <Wallet>
                        <ConnectWallet className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
                            <Name className="text-black" />
                        </ConnectWallet>
                        <WalletDropdown>
                            <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                                <Avatar />
                                <Name />
                                <Address />
                                <EthBalance />
                            </Identity>
                            <WalletDropdownDisconnect />
                        </WalletDropdown>
                    </Wallet>
                </div>

                {/* Logo */}
                <div className="w-full flex justify-center items-center mb-6">
                    <div className="flex flex-col items-center">
                        <img src="/logo-white.png" alt="TactiBall Logo" className="h-42" />
                    </div>
                </div>

                {/* Challenge Message */}
                {roomData && (
                    <div className="w-full max-w-md mb-6">
                        <div className="text-center">
                            <h1 className="text-3xl font-bold text-white mb-2">
                                🎮 {roomData.host_team.name} is challenging you!
                            </h1>
                            <p className="text-blue-200 text-sm">
                                Sign up and connect your wallet in a few clicks below
                            </p>
                        </div>
                    </div>
                )}

                {/* Room Info Card */}
                {roomData && (
                    <div className="w-full max-w-md mb-6">
                        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 border-white/20">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                    {roomData.host_team.name.substring(0, 2).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-bold text-white">{roomData.host_team.name}</h3>
                                    <p className="text-blue-200 text-sm">ELO {formatElo(roomData.host_team.elo_rating)}</p>
                                </div>
                            </div>
                            {roomData.minimum_elo_rating > 0 && (
                                <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3">
                                    <p className="text-yellow-200 text-sm text-center">
                                        ⚡ Minimum ELO requirement: {formatElo(roomData.minimum_elo_rating)}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Platform Selection Info */}
                <div className="w-full max-w-md mb-4">
                    <div className="bg-blue-500 text-white rounded-lg shadow-sm border border-blue-600">
                        <div className="p-4">
                            <div className="flex items-start">
                                <svg className="w-5 h-5 mr-3 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                                <div>
                                    <h3 className="font-semibold text-sm mb-1">
                                        Choose Your Platform
                                    </h3>
                                    <p className="text-xs leading-relaxed">
                                        Play on <strong>Base App</strong>, <strong>Farcaster</strong>, or directly in your <strong>web browser</strong>.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Platform Selection */}
                <div className="w-full max-w-md mb-6">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="p-4">
                            <div className="space-y-3">
                                <a
                                    href={baseAppUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                                >
                                    <span className="text-2xl mr-3">🔵</span>
                                    <div className="text-left">
                                        <div className="text-base">Open in Base</div>
                                        <div className="text-xs opacity-90">Base Mini-App</div>
                                    </div>
                                </a>

                                <a
                                    href={farcasterMiniAppUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full flex items-center justify-center bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                                >
                                    <span className="text-2xl mr-3">🟣</span>
                                    <div className="text-left">
                                        <div className="text-base">Open in Farcaster</div>
                                        <div className="text-xs opacity-90">Farcaster Mini-App</div>
                                    </div>
                                </a>

                                <button
                                    onClick={() => setContinueInWeb(true)}
                                    className="w-full flex items-center justify-center bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-4 rounded-lg transition-all shadow-sm"
                                >
                                    <span className="text-2xl mr-3">🌐</span>
                                    <div className="text-left">
                                        <div className="text-base">Continue in Browser</div>
                                        <div className="text-xs opacity-90">Connect Wallet Here</div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Quick Links */}
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">Quick Links</h3>
                            <div className="grid grid-cols-1 gap-2">
                                <a
                                    href="https://tactiball.fun"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                                >
                                    <span>🏠</span>
                                    <span>Main Website</span>
                                </a>
                                <a
                                    href="https://tactiball.fun/rules-of-game"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                                >
                                    <span>📖</span>
                                    <span>How to Play</span>
                                </a>
                                <a
                                    href="https://t.me/tactiball"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                                >
                                    <span>💬</span>
                                    <span>Telegram Community</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // In mini-app or continuing in web
    return (
        <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme">
            {/* Wallet in top right */}
            <div className="absolute top-4 right-4 z-20">
                <Wallet>
                    <ConnectWallet className="bg-white text-black px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors shadow-md">
                        <Name className="text-black" />
                    </ConnectWallet>
                    <WalletDropdown>
                        <Identity className="px-4 pt-3 pb-2" hasCopyAddressOnClick>
                            <Avatar />
                            <Name />
                            <Address />
                            <EthBalance />
                        </Identity>
                        <WalletDropdownDisconnect />
                    </WalletDropdown>
                </Wallet>
            </div>

            {/* Logo */}
            <div className="w-full flex justify-center items-center mb-6">
                <div className="flex flex-col items-center">
                    <img src="/logo-white.png" alt="TactiBall Logo" className="h-42" />
                </div>
            </div>

            {/* Challenge Message */}
            {roomData && (
                <div className="w-full max-w-md mb-6">
                    <div className="text-center">
                        <h1 className="text-3xl font-bold text-white mb-2">
                            🎮 {roomData.host_team.name} is challenging you!
                        </h1>
                        <p className="text-blue-200 text-sm">
                            Sign up and connect your wallet in a few clicks below
                        </p>
                    </div>
                </div>
            )}

            {/* Room Info Card */}
            {roomData && (
                <div className="w-full max-w-md mb-6">
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border-2 border-white/20">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-xl">
                                {roomData.host_team.name.substring(0, 2).toUpperCase()}
                            </div>
                            <div className="flex-1">
                                <h3 className="text-xl font-bold text-white">{roomData.host_team.name}</h3>
                                <p className="text-blue-200 text-sm">ELO {formatElo(roomData.host_team.elo_rating)}</p>
                            </div>
                        </div>
                        {roomData.minimum_elo_rating > 0 && (
                            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3">
                                <p className="text-yellow-200 text-sm text-center">
                                    ⚡ Minimum ELO requirement: {formatElo(roomData.minimum_elo_rating)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Connect Wallet Card */}
            <div className="w-full max-w-md mb-6">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="p-6">
                        <div className="text-center">
                            {isConnected && address ? (
                                <React.Fragment>
                                    <div className="text-6xl mb-4">✅</div>
                                    <h3 className="text-xl font-bold text-black mb-3">
                                        Wallet Connected!
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Taking you to the game room...
                                    </p>
                                    <div className="flex justify-center">
                                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                                    </div>
                                </React.Fragment>
                            ) : (
                                <React.Fragment>
                                    <div className="text-6xl mb-4">👋</div>
                                    <h3 className="text-xl font-bold text-black mb-3">
                                        Connect Your Wallet
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-6">
                                        Connect your wallet to accept the challenge and join the game.
                                    </p>
                                    <ConnectWallet className="w-full bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg text-white font-medium transition-all">
                                        Connect Wallet
                                    </ConnectWallet>
                                </React.Fragment>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Links */}
            <div className="w-full max-w-md">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                    <div className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 text-center">Quick Links</h3>
                        <div className="grid grid-cols-1 gap-2">
                            <a
                                href="https://tactiball.fun"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                            >
                                <span>🏠</span>
                                <span>Main Website</span>
                            </a>
                            <a
                                href="https://tactiball.fun/rules-of-game"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                            >
                                <span>📖</span>
                                <span>How to Play</span>
                            </a>
                            <a
                                href="https://t.me/tactiball"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm"
                            >
                                <span>💬</span>
                                <span>Telegram Community</span>
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LoadingFallback() {
    return (
        <div className="min-h-screen w-full flex items-center justify-center mini-app-theme">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
        </div>
    );
}

interface RoomInvitePageProps {
    roomId: string;
}

export default function RoomInvitePage({ roomId }: RoomInvitePageProps) {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <RoomInviteContent roomId={roomId} />
        </Suspense>
    );
}
"use client";

import {
  useMiniKit,
  useAuthenticate,
  useAddFrame,
  useOpenUrl,
} from "@coinbase/onchainkit/minikit";
import {
  Name,
  Identity,
  Address,
  Avatar,
  EthBalance,
} from "@coinbase/onchainkit/identity";
import {
  ConnectWallet,
  Wallet,
  WalletDropdown,
  WalletDropdownDisconnect,
} from "@coinbase/onchainkit/wallet";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useChainId } from "wagmi";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { SearchOpponentModal } from "./components/SearchOpponentModal";
import { GameRequestModal } from "./components/GameRequestModal";
import { ChainBadge } from "./components/ChainBadge";
import { EmailAuthModal, type EmailAuthMode } from "./components/EmailAuthModal";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from 'viem/chains';
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import React from "react";
import { Leaderboard } from './components/Leaderboard';
import { GlobalStats } from './components/GlobalStats';
import { api, errorText, formatElo, nsToMs, ok, type GameRequestView } from '@/lib/backend';
import { countryFlag, countryName } from '@/lib/countries';
import { chainName, homeChainName } from '@/lib/chains';
import { gameUrl } from '@/lib/routes';
import { useSession } from './session';

const LOBBY_POLL_MS = 3000;

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const { address, isConnected, team: teamInfo, teamLoading: loading, session, email, walletUnlinked, settings, ensureSignedIn, linkWallet, signOut, refresh, error: sessionError } = useSession();
  const signedIn = isConnected || Boolean(session);
  const [emailModal, setEmailModal] = useState<EmailAuthMode | null>(null);
  const [linkingWallet, setLinkingWallet] = useState(false);
  const chainId = useChainId();
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isSearchOpponentModalOpen, setIsSearchOpponentModalOpen] = useState(false);
  const [gameRequest, setGameRequest] = useState<GameRequestView | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const error = sessionError;

  const addFrame = useAddFrame();
  const openUrl = useOpenUrl();

  // Fetch username from onchain identity
  const fetchUsername = useCallback(async (walletAddress: string) => {
    if (context?.user?.username) {
      setUsername(context?.user?.username);
      return;
    }

    const savedUsername = localStorage.getItem('user_basename');
    const savedAddress = localStorage.getItem('user_address');
    if (savedAddress && savedAddress === walletAddress.toLowerCase()) {
      setUsername(savedUsername);
      return;
    }

    try {
      let nameResult = await getName({ address: walletAddress as `0x${string}`, chain: base });
      // Trim .eth and .base suffixes if present
      if (nameResult && typeof nameResult === 'string') {
        nameResult = nameResult.replace(/\.eth$/i, '').replace(/\.base$/i, '');
      } else {
        // Fallback to shortened address if no name found
        nameResult = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      }
      setUsername(nameResult);
      localStorage.setItem('user_basename', nameResult);
      localStorage.setItem('user_address', walletAddress.toLowerCase());
    } catch (error) {
      console.error('Error fetching username:', error);
      setUsername(`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    }
  }, [context]);

  useEffect(() => {
    if (isConnected && address) {
      fetchUsername(address);
    } else {
      setUsername(null);
    }
  }, [isConnected, address, fetchUsername]);

  const handlePlayNow = useCallback(() => {
    if (!teamInfo) {
      toast.error("You need to create a team first!", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    if (teamInfo.active_game !== undefined) {
      toast.error("You have an ongoing game! Please finish it first.", {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });
      return;
    }

    setIsSearchOpponentModalOpen(true);
  }, [teamInfo]);

  const handleCancelSearch = useCallback(() => {
    setIsSearchOpponentModalOpen(false);
  }, []);

  const handleCreateTeam = useCallback(async (teamName: string, countryIndex: string) => {
    if (!address && !session) {
      setEmailModal("login");
      return;
    }

    setIsCreatingTeam(true);
    try {
      const countryIndexNum = parseInt(countryIndex);
      if (isNaN(countryIndexNum) || countryIndexNum <= 0) {
        throw new Error("Invalid country selection");
      }

      // Signed in with email already, or one wallet signature starts the
      // session; the canister records the chain a wallet signed in from.
      await ensureSignedIn();
      ok(await api().create_team(teamName, countryIndexNum));
      await refresh();

      toast.success(`Team "${teamName}" created successfully!`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });
      setIsCreateTeamModalOpen(false);
    } catch (error) {
      console.error("Error creating team:", error);
      toast.error("Failed to create team: " + errorText(error), {
        position: "top-center",
        autoClose: 5000,
        closeOnClick: true,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });
    } finally {
      setIsCreatingTeam(false);
    }
  }, [address, session, ensureSignedIn, refresh]);

  const handleLinkWallet = useCallback(async () => {
    setLinkingWallet(true);
    try {
      await linkWallet();
      toast.success("Wallet linked: you can now sign in with it too.", { position: "top-center", autoClose: 3000 });
    } catch (e) {
      toast.error("Could not link the wallet: " + errorText(e), { position: "top-center", autoClose: 5000 });
    } finally {
      setLinkingWallet(false);
    }
  }, [linkWallet]);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Lobby: invites for our team, and jump into a game as soon as it starts
  // (an invite we sent was accepted). Replaces v1's Ably team channel.
  const knownGame = useRef<bigint | undefined>(undefined);
  useEffect(() => {
    if (!session || !teamInfo) return;
    knownGame.current = teamInfo.active_game;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const lobby = ok(await api().lobby());
        if (stopped) return;
        if (lobby.active_game !== undefined && lobby.active_game !== knownGame.current) {
          window.location.href = gameUrl(lobby.active_game);
          return;
        }
        const request = lobby.incoming[0] ?? lobby.outgoing[0] ?? null;
        setGameRequest((current) => (current?.id === request?.id ? current : request));
        if (request) setIsSearchOpponentModalOpen(false);
      } catch (e) {
        console.error('Lobby poll failed:', e);
      }
      if (!stopped) timer = setTimeout(poll, LOBBY_POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [session, teamInfo?.id, teamInfo?.active_game]);

  const signInChains = settings?.chains.filter((c) => c.enabled).map((c) => Number(c.chain_id)) ?? [];
  const wrongChain = isConnected && settings && !signInChains.includes(chainId) && !session;
  const teamAgeDays = teamInfo ? Math.floor((Date.now() - nsToMs(teamInfo.created_at)) / 86_400_000) : 0;

  const handleAddFrame = useCallback(async () => {
    const frameAdded = await addFrame();
    setFrameAdded(Boolean(frameAdded));
  }, [addFrame]);

  const saveFrameButton = useMemo(() => {
    if (context && !context.client.added) {
      return (
        <button
          onClick={handleAddFrame}
          className="text-[#0052FF] p-4 text-sm font-medium hover:bg-blue-50 rounded-lg transition-colors"
        >
          Save Frame
        </button>
      );
    }

    if (frameAdded) {
      return (
        <div className="flex items-center space-x-1 text-sm font-medium text-[#0052FF]">
          <span>✓ Saved</span>
        </div>
      );
    }

    return null;
  }, [context, frameAdded, handleAddFrame]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme relative">

      {/* Wallet connection - fixed to right corner */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center space-x-2">
          {session && !isConnected && (
            <div className="flex items-center gap-2 bg-black text-white px-3 py-2 rounded-lg text-sm">
              <span className="max-w-[140px] truncate" title={email ?? undefined}>{email ?? "Signed in"}</span>
              <button onClick={() => signOut()} className="text-gray-300 hover:text-white underline">Sign out</button>
            </div>
          )}
          <Wallet className="z-10">
            <ConnectWallet
              className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors"
              disconnectedLabel="Connect Wallet"
            >
              <Name className="text-white" />
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
      </div>

      {/* Logo - centered on page */}
      <div className="w-full flex justify-center items-center">
        <div className="flex flex-col items-center w-[200px]">
          <img src="/logo2.png" alt="TactiBall Logo" className="h-42 w-full" />
        </div>
      </div>

      {/* How to Play link */}
      <div className="w-full max-w-md flex justify-end mb-3">
        <button
          onClick={() => openUrl(`${window.location.origin}/rules-of-game/`)}
          className="flex items-center gap-1 text-sm text-gray-300 hover:text-white underline transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          How to Play?
        </button>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        {/* Active Game Warning */}
        {teamInfo && teamInfo.active_game !== undefined && (
          <div className="w-full max-w-md mb-4 bg-yellow-500 text-yellow-900 rounded-lg shadow-sm border border-yellow-600">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">
                    You have an ongoing game! Please return to it immediately.
                  </span>
                </div>
                <a
                  href={gameUrl(teamInfo.active_game)}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Return
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Sign-in chains: the canister accepts wallets on Base and Robinhood Chain */}
        {wrongChain && (
          <div className="w-full max-w-md mb-4 bg-blue-50 text-blue-900 rounded-lg border border-blue-200 p-3 text-sm">
            Your wallet is on {chainName(chainId)}. TactiBall signs you in on {signInChains.map(chainName).join(' or ')}; we&apos;ll ask your wallet to switch when you sign in.
          </div>
        )}

        {/* Team info section */}
        {signedIn ? (
          <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">Loading team information...</p>
              </div>
            ) : error ? (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <p className="text-red-500 text-sm mb-3">{error}</p>
                <button
                  onClick={() => refresh()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Retry
                </button>
              </div>
            ) : teamInfo ? (
              <div className="p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
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
                        <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">ELO {formatElo(teamInfo.elo)}</span>
                      </div>
                    </div>

                    {/* Player info */}
                    <div className="flex justify-between items-center mb-2">
                      {address ? (
                        <Identity address={address} className="bg-white px-0 space-x-1 team-coach-username">
                          <Avatar className="w-6 h-6" />
                          <Name className="text-black ml-0" />
                        </Identity>
                      ) : (
                        <span className="text-sm text-gray-700 truncate max-w-[180px]">{email}</span>
                      )}
                      <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded flex items-center gap-1" title={`${countryName(teamInfo.country)} · plays from ${homeChainName(teamInfo.home_chain)}`}>
                        {countryFlag(teamInfo.country)} <ChainBadge chain={teamInfo.home_chain} />
                      </div>
                    </div>

                    {/* League and matches */}
                    <div className="text-sm text-black">
                      {String(teamInfo.games)} matches played · {String(teamInfo.wins)}W {String(teamInfo.draws)}D {String(teamInfo.losses)}L · {teamAgeDays === 0 ? "just created" : `${teamAgeDays} days old`}
                    </div>

                    {/* Active game indicator */}
                    {teamInfo.active_game !== undefined && (
                      <div className="mt-2">
                        <div className="inline-flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                          <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                          <span>Active Game #{String(teamInfo.active_game)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <div className="text-gray-500 mb-4">
                  <p className="text-sm">{session ? "No team on your account yet" : "No team found for this wallet address"}</p>
                  <p className="text-xs mt-1">{session ? "Create a team to get started." : "Create a team to get started. Your wallet signs one message to sign in; no transaction or gas."}</p>
                </div>
                <button
                  onClick={() => setIsCreateTeamModalOpen(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Create Team
                </button>
              </div>
            )}
            {/* Account: sign-in methods on this account */}
            {!loading && (
              <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-gray-500">
                {session && email && <span className="mr-auto truncate max-w-[200px]">Email login: {email}</span>}
                {session && !email && (
                  <button onClick={() => setEmailModal("link")} className="text-blue-600 hover:underline">Add email login</button>
                )}
                {walletUnlinked && (
                  <button onClick={handleLinkWallet} disabled={linkingWallet} className="text-blue-600 hover:underline disabled:opacity-50">
                    {linkingWallet ? "Linking wallet..." : "Link connected wallet"}
                  </button>
                )}
                {!session && (
                  <button onClick={() => setEmailModal("login")} className="text-blue-600 hover:underline">Use email instead</button>
                )}
                {session && (
                  <button onClick={() => signOut()} className="text-gray-500 hover:underline">Sign out</button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-6 text-center">
              <div className="mb-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
              </div>
              <div className="text-gray-500 mb-4">
                <p className="text-sm">Connect your wallet or sign in with email to view your team</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                  Connect Wallet
                </ConnectWallet>
                <button
                  onClick={() => setEmailModal("login")}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign in with email
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                New here?{" "}
                <button onClick={() => setEmailModal("signup")} className="text-blue-600 hover:underline">Sign up with email</button>
              </p>
            </div>
          </div>
        )}

        {/* Primary actions next to team block */}
        <div className="w-full max-w-md mt-2 mb-2">
          <div className="flex justify-center mb-6">
            {teamInfo && teamInfo.active_game !== undefined ? (
              <a
                href={gameUrl(teamInfo.active_game)}
                className="px-8 text-base py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium"
              >
                Return to Game
              </a>
            ) : (
              <button
                onClick={handlePlayNow}
                className="px-8 text-base py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Play Now
              </button>
            )}
          </div>
          {/* <div className="flex items-center justify-between mt-2">
            <div className="text-sm text-gray-700">🔥 32 players online now</div>
            <button className="text-sm text-gray-600 hover:text-gray-800">Share to Feed</button>
          </div> */}
        </div>

        {/* Global game stats */}
        <GlobalStats className="mb-2" />

        {/* Leaderboard preview */}
        <Leaderboard
          limit={50}
          userTeam={teamInfo}
        />
      </div>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSubmit={handleCreateTeam}
        isLoading={isCreatingTeam}
        defaultTeamName={username ? `${username}'s team` : undefined}
      />

      {/* Email sign-in / sign-up / add email */}
      <EmailAuthModal
        isOpen={emailModal !== null}
        initialMode={emailModal ?? "login"}
        onClose={() => setEmailModal(null)}
        onDone={(mode) =>
          toast.success(mode === "signup" ? "Account created. Now create your team!" : mode === "link" ? "Email login added." : "Signed in.", { position: "top-center", autoClose: 3000 })
        }
      />

      {/* Search Opponent Modal */}
      <SearchOpponentModal
        isOpen={isSearchOpponentModalOpen}
        onClose={() => setIsSearchOpponentModalOpen(false)}
        onCancel={handleCancelSearch}
      />

      {/* Game Request Modal */}
      {gameRequest && (
        <GameRequestModal
          isOpen={true}
          onClose={() => setGameRequest(null)}
          request={gameRequest}
          current_team_id={teamInfo?.id ?? null}
        />
      )}
      {/* Toast notifications container */}
      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}

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
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { CreateTeamModal } from "./components/CreateTeamModal";
import { getName } from "@coinbase/onchainkit/identity";
import { base } from 'viem/chains';
import { authUserWithSignature } from '@/lib/auth';
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import countryList from '../public/countryList.json';
import React from "react";

export default function App() {
  const { setFrameReady, isFrameReady, context } = useMiniKit();
  const [frameAdded, setFrameAdded] = useState(false);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<{
    totalTeams: number;
    totalGames: number;
    totalTransactions: number;
  } | null>(null);

  const addFrame = useAddFrame();
  const openUrl = useOpenUrl();

  // Load stats from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('chessball_global_stats');
      console.log('getting stored stats', stored);
      if (stored) {
        const parsed = JSON.parse(stored);
        setGlobalStats(parsed);
      }
    } catch (error) {
      console.error('Error loading stats from localStorage:', error);
    }
  }, []);



  // Fetch global statistics
  const fetchGlobalStats = useCallback(async () => {
    try {
      const response = await fetch('/api/get-global-stat');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('data', data);
      if (data.success) {
        const newStats = data.data;
        setGlobalStats(newStats);

        // Save to localStorage
        try {
          localStorage.setItem('chessball_global_stats', JSON.stringify(newStats));
        } catch (error) {
          console.error('Error saving stats to localStorage:', error);
        }
      }
    } catch (err) {
      console.error('Error fetching global stats:', err);
    }
  }, []);

  // Fetch username from onchain identity
  const fetchUsername = useCallback(async (walletAddress: string) => {
    console.log('fetchUsername', walletAddress);

    console.log('context', context);
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
      console.log('nameResult', nameResult);
      // Trim .eth and .base suffixes if present
      if (nameResult && typeof nameResult === 'string') {
        if (nameResult) {
          nameResult = nameResult.replace(/\.eth$/i, '').replace(/\.base$/i, '');
        }
        setUsername(nameResult);
      } else {
        // Fallback to shortened address if no name found
        nameResult = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
        setUsername(nameResult);
      }

      localStorage.setItem('user_basename', nameResult);
      localStorage.setItem('user_address', walletAddress.toLowerCase());
    } catch (error) {
      console.error('Error fetching username:', error);
      // Fallback to shortened address on error
      setUsername(`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    }
  }, []);

  // Fetch team info when wallet connects
  const fetchTeamInfo = useCallback(async (walletAddress: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/get-team-info?wallet=${walletAddress}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.isFound) {
        setTeamInfo(data.team);
      } else {
        setTeamInfo(null);
      }
    } catch (err) {
      console.error('Error fetching team info:', err);
      setError('Failed to fetch team information');
    } finally {
      setLoading(false);
    }
  }, []);



  const handleCreateTeam = useCallback(async (teamName: string, countryIndex: string) => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    setIsCreatingTeam(true);
    try {
      console.log("Creating team:", { teamName, countryIndex });

      // Convert country index string to number
      const countryIndexNum = parseInt(countryIndex);
      if (isNaN(countryIndexNum) || countryIndexNum <= 0) {
        throw new Error("Invalid country selection");
      }

      console.log('Creating team for address:', address);

      // Get or create authentication signature
      const authSignature = await authUserWithSignature(address, signMessageAsync);
      console.log("Authentication signature obtained:", authSignature);


      // Call the API endpoint
      const response = await fetch('/api/create-team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          signature: authSignature.signature,
          message: authSignature.message,
          teamName: teamName,
          countryId: countryIndexNum
        }),
      });

      const result = await response.json();

      console.log("response", response.status, result);

      if (!response.ok || !result.success) {
        console.log("Toast here");
        setIsCreateTeamModalOpen(false);

        let errorMessage = "Failed to create team: " + result.error;
        if (result.errorName) {
          errorMessage += " (ERR:" + result.errorName + ")";
        }
        toast.error(errorMessage, {
          position: "top-center",
          autoClose: 5000,
          closeOnClick: true,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });

        return;
      }

      console.log("Team created successfully:", result);

      // Show success toast notification
      toast.success(`Team "${teamName}" created successfully!`, {
        position: "top-center",
        autoClose: 3000,
        hideProgressBar: false,
        draggable: true,
        progress: undefined,
      });

      if (address) {
        fetchTeamInfo(address);
      }

      // Close modal and show success message
      setIsCreateTeamModalOpen(false);
      alert(`Team created successfully! Transaction: ${result.transactionHash}`);
    } catch (error) {
      console.error("Error creating team:", error);

      // Provide user-friendly error messages
      let errorMessage = "Failed to create team. Please try again.";
      console.log("Error creating team:", error);

      alert(errorMessage);
    } finally {
      setIsCreatingTeam(false);
    }
  }, [address, fetchTeamInfo]);

  // Watch for wallet connection changes
  useEffect(() => {
    if (isConnected && address) {
      fetchTeamInfo(address);
      fetchUsername(address);
      fetchGlobalStats(); // Fetch global stats on wallet connection
    } else {
      setTeamInfo(null);
      setError(null);
      setUsername(null);
      setGlobalStats(null); // Clear global stats on wallet disconnection
    }
  }, [isConnected, address]);

  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Fetch global stats on component mount
  useEffect(() => {
    fetchGlobalStats();
  }, [fetchGlobalStats]);

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

  // Cache for country flags to avoid repeated lookups
  const countryFlagCache = React.useMemo(() => new Map<number, string>(), []);

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

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme relative">

      {/* Wallet connection - fixed to right corner */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center space-x-2">
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
          {saveFrameButton && (
            <div className="ml-2">{saveFrameButton}</div>
          )}
        </div>
      </div>

      {/* Logo - centered on page */}
      <div className="w-full flex justify-center items-center">
        <div className="flex flex-col items-center">
          <img src="/logo-white.png" alt="ChessBall Logo" className="h-42" />
        </div>
      </div>

      {/* Main content */}
      <div className="w-full max-w-md">
        {/* Team info section */}
        {isConnected ? (
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
                  onClick={() => address && fetchTeamInfo(address)}
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
                        <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">ELO {teamInfo.elo_rating}</span>
                      </div>
                    </div>

                    {/* Player info */}
                    <div className="flex justify-between items-center mb-2">
                      <Identity className="bg-white px-0 space-x-1 team-coach-username">
                        <Avatar className="w-6 h-6" />
                        <Name className="text-black ml-0" />
                      </Identity>
                      <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded" title={`Position: ${teamInfo.leaguePosition}th in ${teamInfo.country} / ${teamInfo.globalPosition}th globally`}>
                        {teamInfo.leaguePosition}th {getCountryFlag(teamInfo.countryIndex)} / {teamInfo.globalPosition}th 🌍
                      </div>
                    </div>

                    {/* League and matches */}
                    <div className="text-sm text-black">
                      {teamInfo.matchesPlayed} matches played · {teamInfo.teamAge === 0 ? "just created" : `${teamInfo.teamAge} days old`}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
                </div>
                <div className="text-gray-500 mb-4">
                  <p className="text-sm">No team found for this wallet address</p>
                  <p className="text-xs mt-1">Create a team to get started</p>
                </div>
                <button
                  onClick={() => setIsCreateTeamModalOpen(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Create Team
                </button>
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
                <p className="text-sm">Connect your wallet to view your team information</p>
              </div>
              <div className="flex justify-center">
                <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                  Connect Wallet
                </ConnectWallet>
              </div>
            </div>
          </div>
        )}

        {/* Primary actions next to team block */}
        <div className="w-full max-w-md mt-2 mb-2">
          <div className="flex justify-center mb-6">
            <button className="px-8 text-base py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium">
              Play Now
            </button>
          </div>
          {/* <div className="flex items-center justify-between mt-2">
            <div className="text-sm text-gray-700">🔥 32 players online now</div>
            <button className="text-sm text-gray-600 hover:text-gray-800">Share to Feed</button>
          </div> */}
        </div>

        {/* Global game stats */}
        <div className="w-full max-w-md mb-2 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xl font-bold animate-number">{globalStats ? globalStats.totalTeams : '0'}</div>
              <div className="text-xs text-gray-600">Teams</div>
            </div>
            <div>
              <div className="text-xl font-bold animate-number">{globalStats ? globalStats.totalGames : '0'}</div>
              <div className="text-xs text-gray-600">Games Played</div>
            </div>
            <div>
              <div className="text-xl font-bold animate-number">{globalStats ? globalStats.totalTransactions : '0'}</div>
              <div className="text-xs text-gray-600">Transactions</div>
            </div>
          </div>
        </div>

        {/* Leaderboard preview */}
        <div className="w-full max-w-md bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2">Leaderboard · August</h3>
            <table className="w-full text-sm text-left">
              <thead className="text-gray-600">
                <tr className="border-b">
                  <th className="py-2 pr-2">Pos</th>
                  <th className="py-2 pr-2">Team</th>
                  <th className="py-2 pr-2 text-center">M</th>
                  <th className="py-2 pr-2 text-center">W</th>
                  <th className="py-2 pr-2 text-center">D</th>
                  <th className="py-2 pr-2 text-center">L</th>
                  <th className="py-2 pr-2">Form</th>
                  <th className="py-2 pr-2 text-right">EloΔ</th>
                </tr>
              </thead>
              <tbody>
                {/* User team pinned */}
                <tr className="bg-green-50">
                  <td className="py-2 pr-2">—</td>
                  <td className="py-2 pr-2 font-medium">Your Team</td>
                  <td className="py-2 pr-2 text-center">14</td>
                  <td className="py-2 pr-2 text-center">7</td>
                  <td className="py-2 pr-2 text-center">2</td>
                  <td className="py-2 pr-2 text-center">5</td>
                  <td className="py-2 pr-2">
                    <div className="flex gap-1 items-center">
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                      <span className="h-2 w-2 rounded-full bg-red-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right font-medium">+60</td>
                </tr>
                {/* Top 3 */}
                <tr className="border-t">
                  <td className="py-2 pr-2">1</td>
                  <td className="py-2 pr-2 font-medium">ChessMasters</td>
                  <td className="py-2 pr-2 text-center">14</td>
                  <td className="py-2 pr-2 text-center">11</td>
                  <td className="py-2 pr-2 text-center">2</td>
                  <td className="py-2 pr-2 text-center">1</td>
                  <td className="py-2 pr-2">
                    <div className="flex gap-1 items-center">
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right">+140</td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 pr-2">2</td>
                  <td className="py-2 pr-2 font-medium">Pawns United</td>
                  <td className="py-2 pr-2 text-center">14</td>
                  <td className="py-2 pr-2 text-center">10</td>
                  <td className="py-2 pr-2 text-center">3</td>
                  <td className="py-2 pr-2 text-center">1</td>
                  <td className="py-2 pr-2">
                    <div className="flex gap-1 items-center">
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-red-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right">+120</td>
                </tr>
                <tr className="border-t">
                  <td className="py-2 pr-2">3</td>
                  <td className="py-2 pr-2 font-medium">Rook Attack</td>
                  <td className="py-2 pr-2 text-center">14</td>
                  <td className="py-2 pr-2 text-center">9</td>
                  <td className="py-2 pr-2 text-center">2</td>
                  <td className="py-2 pr-2 text-center">3</td>
                  <td className="py-2 pr-2">
                    <div className="flex gap-1 items-center">
                      <span className="h-2 w-2 rounded-full bg-red-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-gray-400"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                      <span className="h-2 w-2 rounded-full bg-green-600"></span>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-right">+90</td>
                </tr>
              </tbody>
            </table>
            <div className="flex justify-center mt-3">
              <button className="border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
                View Full Leaderboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Team Modal */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSubmit={handleCreateTeam}
        isLoading={isCreatingTeam}
        defaultTeamName={username ? `${username}'s team` : undefined}
      />
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

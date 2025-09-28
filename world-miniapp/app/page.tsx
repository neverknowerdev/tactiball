"use client";

import { MiniKit } from "@worldcoin/minikit-js";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi"; // Keep useAccount/useSignMessage for now, will remove if not needed after World App fully integrates signing
import { CreateTeamModal } from "./components/CreateTeamModal";
import { SearchOpponentModal } from "./components/SearchOpponentModal";
import { GameRequestModal } from "./components/GameRequestModal";
import { subscribeToTeamChannel, unsubscribeFromTeamChannel } from "@/lib/ably";
import { base } from "viem/chains";
import { authenticateWithWorldApp, useWorldApp } from "@/lib/auth";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import countryList from "../public/countryList.json";
import React from "react";
import { LastGameResults } from "./components/LastGameResults";
import { Leaderboard } from "./components/Leaderboard";
import { GlobalStats } from "./components/GlobalStats";
import moment from "moment";

export default function App() {
  const {
    isInstalled: isWorldAppInstalled,
    user: worldAppUser,
    isAuthenticated: isWorldAppAuthenticated,
    authenticate: authenticateWorldApp,
    signMessage: worldAppSignMessage, // New: World App sign message
  } = useWorldApp();

  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { signMessageAsync: wagmiSignMessageAsync } = useSignMessage();

  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isSearchOpponentModalOpen, setIsSearchOpponentModalOpen] =
    useState(false);
  const [isGameRequestModalOpen, setIsGameRequestModalOpen] = useState(false);
  const [gameRequestData, setGameRequestData] = useState<{
    game_request_id: string;
    team1_info: any;
    team2_info: any;
  } | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Determine the active wallet address and connection status
  const currentAddress = worldAppUser?.walletAddress || wagmiAddress;
  const isConnected = isWorldAppAuthenticated || isWagmiConnected;

  // Function to sign messages: prioritize World App's signMessage
  const signMessage = useCallback(
    async (message: string) => {
      if (isWorldAppAuthenticated && worldAppSignMessage) {
        return worldAppSignMessage(message);
      }
      // Fallback to wagmi if World App is not authenticated or signMessage is not available
      if (isWagmiConnected && wagmiSignMessageAsync) {
        return wagmiSignMessageAsync({ message });
      }
      throw new Error("No connected wallet or signing method available.");
    },
    [isWorldAppAuthenticated, worldAppSignMessage, isWagmiConnected, wagmiSignMessageAsync],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch username: prioritize World App username
  const fetchUsername = useCallback(
    async (walletAddress: string) => {
      console.log("fetchUsername", walletAddress);

      if (worldAppUser?.username) {
        setUsername(worldAppUser.username);
        return;
      }

      // Fallback for getting username, can be removed if World App is the only source
      setUsername(`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    },
    [worldAppUser?.username],
  );

  // Fetch team info when wallet connects (World App or otherwise)
  const fetchTeamInfo = useCallback(
    async (walletAddress: string) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/get-team-info?wallet=${walletAddress}`,
        );
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log("teamInfo", data);

        if (data.is_found) {
          setTeamInfo(data.team);
          if (isMounted) {
            localStorage.setItem("user_team_id", data.team.id);
            localStorage.setItem("userTeam", JSON.stringify(data.team));
          }
        } else {
          setTeamInfo(null);
          if (isMounted) {
            localStorage.removeItem("user_team_id");
          }
        }
      } catch (err) {
        console.error("Error fetching team info:", err);
        setError("Failed to fetch team information");
      } finally {
        setLoading(false);
      }
    },
    [isMounted],
  );

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

    if (teamInfo.active_game_id) {
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

  const handleCreateTeam = useCallback(
    async (teamName: string, countryIndex: string) => {
      if (!currentAddress) {
        alert("Please connect your wallet first");
        return;
      }

      setIsCreatingTeam(true);
      try {
        console.log("Creating team:", { teamName, countryIndex });

        const countryIndexNum = parseInt(countryIndex);
        if (isNaN(countryIndexNum) || countryIndexNum <= 0) {
          throw new Error("Invalid country selection");
        }

        console.log("Creating team for address:", currentAddress);

        // Use World App authentication directly
        const authResult = await authenticateWorldApp(); // Call World App auth if not already authenticated

        if (!authResult) {
          throw new Error("World App authentication failed.");
        }

        // Call the API endpoint
        const response = await fetch("/api/create-team", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            walletAddress: authResult.address,
            signature: authResult.signature,
            message: authResult.message,
            teamName: teamName,
            countryId: countryIndexNum,
          }),
        });

        const result = await response.json();

        console.log("response", response.status, result);

        if (!response.ok || !result.success) {
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

        toast.success(`Team "${teamName}" created successfully!`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });

        if (currentAddress) {
          fetchTeamInfo(currentAddress);
        }

        setIsCreateTeamModalOpen(false);
      } catch (error) {
        console.error("Error creating team:", error);
        let errorMessage = "Failed to create team. Please try again.";
        console.log("Error creating team:", error);
        alert(errorMessage);
      } finally {
        setIsCreatingTeam(false);
      }
    },
    [currentAddress, fetchTeamInfo, authenticateWorldApp],
  );

  // Watch for connection changes and World App authentication status
  useEffect(() => {
    if (isConnected && currentAddress) {
      fetchTeamInfo(currentAddress);
      fetchUsername(currentAddress);
    } else {
      setTeamInfo(null);
      setError(null);
      setUsername(null);
      unsubscribeFromTeamChannel();
    }
  }, [isConnected, currentAddress, fetchTeamInfo, fetchUsername]);


  // Subscribe to team channel when team info is available
  useEffect(() => {
    if (teamInfo?.id && isConnected && currentAddress) {
      const connectToTeam = async () => {
        try {
          await subscribeToTeamChannel(teamInfo.id);
          console.log(`Connected to team ${teamInfo.id} channel`);
        } catch (error) {
          console.error("Failed to connect to team channel:", error);
        }
      };

      connectToTeam();

      return () => {
        unsubscribeFromTeamChannel();
      };
    }
  }, [teamInfo?.id, isConnected, currentAddress]);

  // Listen for game events from team channel
  useEffect(() => {
    const handleGameEvent = (event: CustomEvent) => {
      const gameEvent = event.detail;
      console.log("Received game event on page level:", gameEvent);

      if (gameEvent.type === "GAME_REQUEST_CREATED") {
        console.log("GAME_REQUEST_CREATED event received:", gameEvent);
        setIsSearchOpponentModalOpen(false);
        setIsGameRequestModalOpen(true);

        setGameRequestData({
          game_request_id: gameEvent.game_request_id,
          team1_info: gameEvent.team1_info,
          team2_info: gameEvent.team2_info,
        });
      } else if (gameEvent.type === "GAME_REQUEST_CANCELLED") {
        console.log("GAME_REQUEST_CANCELLED event received:", gameEvent);
        setIsSearchOpponentModalOpen(false);
        setIsGameRequestModalOpen(false);
        setGameRequestData(null);

        toast.error(`Game request ${gameEvent.game_request_id} cancelled!`, {
          position: "top-center",
          autoClose: 3000,
          hideProgressBar: false,
          draggable: true,
          progress: undefined,
        });
      } else if (gameEvent.type === "GAME_STARTED") {
        console.log("GAME_STARTED event received:", gameEvent);

        if (
          gameEvent.team1_id === teamInfo?.id ||
          gameEvent.team2_id === teamInfo?.id
        ) {
          console.log("Game started for current team:", gameEvent);
          const gameUrl = `/game/${gameEvent.game_id}/`;
          console.log("Redirecting to game:", gameUrl);
          window.location.href = gameUrl;
        }
      }
    };

    window.addEventListener("game-event", handleGameEvent as EventListener);

    return () => {
      window.removeEventListener(
        "game-event",
        handleGameEvent as EventListener,
      );
    };
  }, [teamInfo, username, currentAddress, signMessage]);


  const countryFlagCache = React.useMemo(() => new Map<number, string>(), []);

  const formatElo = (elo: number): string => {
    return (elo / 100).toFixed(2);
  };

  const getCountryFlag = React.useCallback(
    (countryIndex: number) => {
      if (countryFlagCache.has(countryIndex)) {
        return countryFlagCache.get(countryIndex)!;
      }

      const country = countryList.find((c) => c.index === countryIndex);

      if (country && country.code) {
        const codePoints = country.code
          .toUpperCase()
          .split("")
          .map((char) => char.charCodeAt(0) + 127397);

        const flag = String.fromCodePoint(...codePoints);

        countryFlagCache.set(countryIndex, flag);

        return flag;
      }

      const fallback = `#${countryIndex}`;
      countryFlagCache.set(countryIndex, fallback);
      return fallback;
    },
    [countryFlagCache],
  );

  if (!isMounted) {
    return null;
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme relative">
      {/* World App Connection Indicator & Authentication Button */}
      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center space-x-2">
          {isWorldAppInstalled ? (
            <button
              onClick={authenticateWorldApp}
              className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
            >
              {isWorldAppAuthenticated
                ? `Connected: ${worldAppUser?.username || currentAddress?.slice(0, 6)}...`
                : "Connect World App"}
            </button>
          ) : (
            <a
              href="https://worldcoin.org/download"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              Get World App
            </a>
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
        {/* Active Game Warning */}
        {teamInfo && teamInfo.active_game_id && (
          <div className="w-full max-w-md mb-4 bg-yellow-500 text-yellow-900 rounded-lg shadow-sm border border-yellow-600">
            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <svg
                    className="w-5 h-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">
                    You have an ongoing game! Please return to it immediately.
                  </span>
                </div>
                <a
                  href={`/game/${teamInfo.active_game_id}/`}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                >
                  Return
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Team info section */}
        {isConnected ? (
          <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600">
                  Loading team information...
                </p>
              </div>
            ) : error ? (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Your Team
                  </h3>
                </div>
                <p className="text-red-500 text-sm mb-3">{error}</p>
                <button
                  onClick={() => currentAddress && fetchTeamInfo(currentAddress)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  Retry
                </button>
              </div>
            ) : teamInfo ? (
              <div className="p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Your Team
                  </h3>
                </div>
                <div className="flex items-start gap-4">
                  {/* Shield logo */}
                  <div className="h-16 w-16 bg-yellow-400 rounded-lg border-2 border-black flex items-center justify-center">
                    <div className="text-black text-lg font-bold">
                      {teamInfo.name?.substring(0, 2).toUpperCase() || "TM"}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <h2 className="text-xl font-bold text-black">
                        {teamInfo.name}
                      </h2>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-sm font-semibold text-white bg-blue-600 px-2 py-1 rounded-md">
                          ELO {formatElo(teamInfo.elo_rating)}
                        </span>
                      </div>
                    </div>

                    {/* Player info */}
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center space-x-1 team-coach-username">
                        {/* World App User Avatar (if available) */}
                        {worldAppUser?.profilePictureUrl && (
                          <img
                            src={worldAppUser.profilePictureUrl}
                            alt="Profile"
                            className="w-6 h-6 rounded-full"
                          />
                        )}
                        <span className="text-black ml-0">
                          {username ||
                            `${currentAddress?.slice(0, 6)}...${currentAddress?.slice(-4)}`}
                        </span>
                      </div>
                      <div
                        className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded"
                        title={`Position: ${teamInfo.league_position}th in ${teamInfo.country} / ${teamInfo.global_position}th globally`}
                      >
                        {teamInfo.league_position}th{" "}
                        {getCountryFlag(teamInfo.country_index)} /{" "}
                        {teamInfo.global_position}th 🌍
                      </div>
                    </div>

                    {/* League and matches */}
                    <div className="text-sm text-black">
                      {teamInfo.matchesPlayed} matches played ·{" "}
                      {teamInfo.team_age === 0
                        ? "just created"
                        : `${teamInfo.team_age} days old`}
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
            ) : (
              <div className="p-4 text-center">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    Your Team
                  </h3>
                </div>
                <div className="text-gray-500 mb-4">
                  <p className="text-sm">
                    No team found for this wallet address
                  </p>
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
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Your Team
                </h3>
              </div>
              <div className="text-gray-500 mb-4">
                <p className="text-sm">
                  Connect your World App wallet to view your team information
                </p>
              </div>
              <div className="flex justify-center">
                {isWorldAppInstalled ? (
                  <button
                    onClick={authenticateWorldApp}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Connect World App
                  </button>
                ) : (
                  <a
                    href="https://worldcoin.org/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Get World App to Connect
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Primary actions next to team block */}
        <div className="w-full max-w-md mt-2 mb-2">
          <div className="flex justify-center mb-6">
            {teamInfo && teamInfo.active_game_id ? (
              <a
                href={`/game/${teamInfo.active_game_id}/`}
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
        </div>

        {/* Global game stats */}
        <GlobalStats className="mb-2" />

        {/* Leaderboard preview */}
        <Leaderboard
          period="month"
          limit={50}
          userLeaderboardData={teamInfo?.leaderboard}
          userTeamInfo={
            teamInfo
              ? {
                  id: teamInfo.id,
                  name: teamInfo.name,
                  country_index: teamInfo.country_index,
                  elo_rating: teamInfo.elo_rating,
                }
              : undefined
          }
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

      {/* Search Opponent Modal */}
      <SearchOpponentModal
        isOpen={isSearchOpponentModalOpen}
        onClose={() => setIsSearchOpponentModalOpen(false)}
        onCancel={handleCancelSearch}
        userInfo={
          teamInfo && currentAddress
            ? {
                team_name: teamInfo.name,
                team_id: teamInfo.id,
                user_wallet_address: currentAddress,
                username: username || "",
                elo_rating: teamInfo.elo_rating,
              }
            : null
        }
      />

      {/* Game Request Modal */}
      {gameRequestData && (
        <GameRequestModal
          isOpen={isGameRequestModalOpen}
          onClose={() => {
            setIsGameRequestModalOpen(false);
            setGameRequestData(null);
          }}
          game_request_id={gameRequestData.game_request_id}
          team1_info={gameRequestData.team1_info}
          team2_info={gameRequestData.team2_info}
          current_team_id={teamInfo?.id || null}
          current_user_wallet={currentAddress as `0x${string}`}
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
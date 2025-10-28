"use client";

import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { useEffect, useState, useCallback } from "react";
import { useAccount, useSignMessage, useChainId, useSwitchChain } from "wagmi";
import { toast, ToastContainer } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';

// Components
import { WalletConnection } from './components/WalletConnection';
import { AppHeader } from './components/AppHeader';
import { ActiveGameWarning } from './components/ActiveGameWarning';
import { TeamInfoSection } from './components/TeamInfoSection';
import { PrimaryActions } from './components/PrimaryActions';
import { CreateTeamModal } from "./components/CreateTeamModal";
import { SearchOpponentModal } from "./components/SearchOpponentModal";
import { GameRequestModal } from "./components/GameRequestModal";
import { GlobalStats } from './components/GlobalStats';
import { Leaderboard } from './components/Leaderboard';
import { ChangeTeamNameModal } from './components/ChangeTeamNameModal';
import { TeamSettingsModal } from './components/TeamSettingsModal';

// Hooks
import { useTeamInfo } from './hooks/useTeamInfo';
import { useUsername } from './hooks/useUsername';
import { useChainManager } from './hooks/useChainManager';
import { useTeamChannel } from './hooks/useTeamChannel';
import { useGameEvents } from './hooks/useGameEvents';
import { useFrameManager } from './hooks/useFrameManager';

// Utils
import { createTeam } from './utils/teamActions';

export default function App() {
  const { setFrameReady, isFrameReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  // Modal states
  const [isCreateTeamModalOpen, setIsCreateTeamModalOpen] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [isSearchOpponentModalOpen, setIsSearchOpponentModalOpen] = useState(false);
  const [isGameRequestModalOpen, setIsGameRequestModalOpen] = useState(false);
  const [isChangeNameModalOpen, setIsChangeNameModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [gameRequestData, setGameRequestData] = useState<{
    game_request_id: string;
    team1_info: any;
    team2_info: any;
  } | null>(null);

  // Custom hooks
  const { teamInfo, loading, error, fetchTeamInfo } = useTeamInfo(address, isConnected);
  const { username } = useUsername(address, isConnected);
  useChainManager(chainId, switchChain);
  useTeamChannel(teamInfo?.id, isConnected, address);
  useGameEvents(
    teamInfo,
    setIsSearchOpponentModalOpen,
    setIsGameRequestModalOpen,
    setGameRequestData
  );
  useFrameManager(setFrameReady, isFrameReady);

  const handlePlayNow = () => {
    if (!teamInfo) {
      toast.error("You need to create a team first!", {
        position: "top-center",
        autoClose: 3000,
      });
      return;
    }
    if (teamInfo.active_game_id) {
      toast.error("You have an ongoing game! Please finish it first.", {
        position: "top-center",
        autoClose: 3000,
      });
      return;
    }

    setIsSearchOpponentModalOpen(true);
  }, [teamInfo]);

  const handleCreateTeam = useCallback(async (teamName: string, countryIndex: string) => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }

    setIsCreatingTeam(true);
    try {
      await createTeam(teamName, countryIndex, address, signMessageAsync);
      
      toast.success(`Team "${teamName}" created successfully!`, {
        position: "top-center",
        autoClose: 3000,
      });

      fetchTeamInfo(address);
      setIsCreateTeamModalOpen(false);
    } catch (error) {
      console.error("Error creating team:", error);
      // Error handling is done in createTeam utility
    } finally {
      setIsCreatingTeam(false);
    }
  }, [address, fetchTeamInfo, signMessageAsync]);

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 font-sans mini-app-theme relative">
      <WalletConnection />
      <AppHeader />

      <div className="w-full max-w-md">
        <ActiveGameWarning teamInfo={teamInfo} />
        
        <TeamInfoSection
          isConnected={isConnected}
          loading={loading}
          error={error}
          teamInfo={teamInfo}
          address={address}
          fetchTeamInfo={fetchTeamInfo}
          onCreateTeam={() => setIsCreateTeamModalOpen(true)}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />

        <PrimaryActions
          teamInfo={teamInfo}
          onPlayNow={handlePlayNow}
        />

        <GlobalStats className="mb-2" />

        <Leaderboard
          period="month"
          limit={50}
          userLeaderboardData={teamInfo?.leaderboard}
          userTeamInfo={teamInfo ? {
            id: teamInfo.id,
            name: teamInfo.name,
            country_index: teamInfo.country_index,
            elo_rating: teamInfo.elo_rating
          } : undefined}
        />
      </div>

      {/* Modals */}
      <CreateTeamModal
        isOpen={isCreateTeamModalOpen}
        onClose={() => setIsCreateTeamModalOpen(false)}
        onSubmit={handleCreateTeam}
        isLoading={isCreatingTeam}
        defaultTeamName={username ? `${username}'s team` : undefined}
      />

      <SearchOpponentModal
        isOpen={isSearchOpponentModalOpen}
        onClose={() => setIsSearchOpponentModalOpen(false)}
        onCancel={() => setIsSearchOpponentModalOpen(false)}
        userInfo={teamInfo ? {
          team_name: teamInfo.name,
          team_id: teamInfo.id,
          user_wallet_address: address || '',
          username: username || '',
          elo_rating: teamInfo.elo_rating
        } : null}
      />

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
          current_user_wallet={address as `0x${string}`}
        />
      )}

      {teamInfo && (
        <>
          <ChangeTeamNameModal
            isOpen={isChangeNameModalOpen}
            onClose={() => setIsChangeNameModalOpen(false)}
            onSuccess={() => {
              if (address) {
                fetchTeamInfo(address);
              }
            }}
            currentTeamName={teamInfo.name}
            walletAddress={address}
          />

          <TeamSettingsModal
            isOpen={isSettingsModalOpen}
            onClose={() => setIsSettingsModalOpen(false)}
            onChangeNameClick={() => setIsChangeNameModalOpen(true)}
            teamName={teamInfo.name}
          />
        </>
      )}

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

      {/* Change Team Name Modal */}
      {teamInfo && (
        <ChangeTeamNameModal
          isOpen={isChangeNameModalOpen}
          onClose={() => setIsChangeNameModalOpen(false)}
          onSuccess={() => {
            // Refresh team info after successful name change
            if (address) {
              fetchTeamInfo(address);
            }
          }}
          currentTeamName={teamInfo.name}
          walletAddress={address}
        />
      )}

      {/* Team Settings Modal */}
      {teamInfo && (
        <TeamSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          onChangeNameClick={() => setIsChangeNameModalOpen(true)}
          teamName={teamInfo.name}
        />
      )}
    </div>
  );
}
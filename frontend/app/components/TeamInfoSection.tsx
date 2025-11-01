import { ConnectWallet } from "@coinbase/onchainkit/wallet";
import { TeamCard } from "./TeamCard";
import { LoadingSpinner } from "./LoadingSpinner";
import { ErrorMessage } from "./ErrorMessage";
import { NoTeamMessage } from "./NoTeamMessage";

interface TeamInfoSectionProps {
  isConnected: boolean;
  loading: boolean;
  error: string | null;
  teamInfo: any;
  address: string | undefined;
  fetchTeamInfo: (address: string) => void;
  onCreateTeam: () => void;
  onOpenSettings: () => void;
}

export function TeamInfoSection({
  isConnected,
  loading,
  error,
  teamInfo,
  address,
  fetchTeamInfo,
  onCreateTeam,
  onOpenSettings
}: TeamInfoSectionProps) {
  if (!isConnected) {
    return (
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
    );
  }

  return (
    <div className="w-full max-w-md mb-6 bg-white rounded-lg shadow-sm border border-gray-200">
      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage 
          error={error} 
          onRetry={() => address && fetchTeamInfo(address)} 
        />
      ) : teamInfo ? (
        <TeamCard 
          teamInfo={teamInfo} 
          onOpenSettings={onOpenSettings} 
        />
      ) : (
        <NoTeamMessage onCreateTeam={onCreateTeam} />
      )}
    </div>
  );
}
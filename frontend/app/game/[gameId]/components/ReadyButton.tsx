import { ConnectWallet } from "@coinbase/onchainkit/wallet";
import { GameSubmissionState } from '../types';

interface ReadyButtonProps {
    isConnected: boolean;
    game: any;
    gameSubmissionState: GameSubmissionState;
    onReady: () => void;
}

export default function ReadyButton({ isConnected, game, gameSubmissionState, onReady }: ReadyButtonProps) {
    return (
        <div className="mt-4 flex justify-center">
            {!isConnected ? (
                <ConnectWallet className="bg-black px-4 py-2 rounded-lg hover:bg-gray-800 custom-connect-wallet">
                    Connect Wallet
                </ConnectWallet>
            ) : (
                <button
                    onClick={onReady}
                    disabled={game.playerMoves.length === 0 || gameSubmissionState !== GameSubmissionState.IDLE}
                    className={`px-8 py-3 font-semibold rounded-lg transition-colors shadow-lg ${game.playerMoves.length === 0
                        ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                        : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                >
                    Ready!
                </button>
            )}
        </div>
    );
}


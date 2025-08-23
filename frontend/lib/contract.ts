import { type Address } from 'viem';
import gameArtifact from '../../artifacts/contracts/Game.sol/ChessBallGame.json';

export const CONTRACT_ADDRESS = '0x63D9Bc6A1e2c85CC4e1d5b4D57D35b130D74Dd9a' as Address;
// Import the ABI from the web3-functions directory
export const CONTRACT_ABI = gameArtifact.abi as any[];

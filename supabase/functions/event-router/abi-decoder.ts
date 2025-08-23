// ABI Decoder for smart contract events and function calls
// This provides proper decoding of event data and function ABIs according to the contract
import { decodeEventLog } from 'npm:viem@latest';
import gameArtifact from './abi.json' with {
    type: "json"
};
export const CONTRACT_ADDRESS = '0x63D9Bc6A1e2c85CC4e1d5b4D57D35b130D74Dd9a';
// Import the ABI from the local abi.json file
export const CONTRACT_ABI = gameArtifact.abi;
export class AbiDecoder {
    static decodeEventData(logData, topics) {
        const decoded = decodeEventLog({
            abi: CONTRACT_ABI,
            data: logData,
            topics: topics
        });
        console.log('decoded', decoded);
        return decoded;
    }
}

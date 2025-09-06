// ABI Decoder for smart contract events and function calls
// This provides proper decoding of event data and function ABIs according to the contract
import { decodeEventLog } from 'npm:viem@latest';
import gameArtifact from './abi.json' with {
    type: "json"
};

export const CONTRACT_ADDRESS = Deno.env.get('CONTRACT_ADDRESS');
// Import the ABI from the local abi.json file
export const CONTRACT_ABI = gameArtifact.abi;

// Define the DecodedEvent type
export interface DecodedEvent {
    eventName: string;
    args: Record<string, any>;
}

export class AbiDecoder {
    static decodeEventData(logData: any, topics: any): DecodedEvent {
        const decoded = decodeEventLog({
            abi: CONTRACT_ABI,
            data: logData,
            topics: topics
        });
        console.log('decoded', decoded);
        return decoded as DecodedEvent;
    }

    /**
     * Universal method to decode event args with automatic number conversion
     * @param decodedData - The decoded event data from decodeEventData
     * @returns Object with args converted to appropriate types
     */
    static decodeArgsWithTypes(decodedData: DecodedEvent) {
        const convertedArgs: any = {};

        // Convert all args to appropriate types
        for (const [key, value] of Object.entries(decodedData.args)) {
            // Convert BigInt to Number for numeric values
            if (typeof value === 'bigint') {
                convertedArgs[key] = Number(value);
            }
            // Convert string numbers to actual numbers if they look like numbers
            else if (typeof value === 'string' && /^\d+$/.test(value)) {
                convertedArgs[key] = Number(value);
            }
            // Keep other types as is
            else {
                convertedArgs[key] = value;
            }
        }

        return convertedArgs;
    }

    /**
     * Helper method to get typed args for specific event types
     * @param decodedData - The decoded event data
     * @returns Typed args object
     */
    static getTypedArgs<T = any>(decodedData: DecodedEvent): T {
        return this.decodeArgsWithTypes(decodedData) as T;
    }
}

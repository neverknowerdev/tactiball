import { decodeData, bufferToBigint } from '../frontend/lib/encrypting';
import { deserializeMoves, TeamEnum } from '../frontend/lib/game';

/**
 * Decodes encrypted moves using a symmetric key and movesMade as nonce
 * @param encryptedMovesHex - The encrypted moves as a hex string (with or without 0x prefix)
 * @param symmetricKey - The symmetric key for decryption (base64 encoded)
 * @param movesMade - The number of moves made, used as a nonce
 * @param teamEnum - The team enum to use for deserialization (optional, defaults to TEAM1)
 * @returns Decoded and deserialized moves as GameAction array
 */
function decodeMoves(
    encryptedMovesHex: string,
    symmetricKey: string,
    movesMade: number,
    teamEnum: TeamEnum = TeamEnum.TEAM1
) {
    try {
        console.log('🔓 Starting move decryption process...');
        console.log(`📊 Input parameters:`);
        console.log(`   Encrypted moves hex: ${encryptedMovesHex}`);
        console.log(`   Symmetric key: ${symmetricKey}`);
        console.log(`   Moves made: ${movesMade}`);
        console.log(`   Team enum: ${teamEnum}`);

        // Remove '0x' prefix if present
        const cleanHex = encryptedMovesHex.startsWith('0x')
            ? encryptedMovesHex.slice(2)
            : encryptedMovesHex;

        // Convert hex string to Buffer
        const encryptedMovesBuffer = Buffer.from(cleanHex, 'hex');
        console.log(`📦 Encrypted moves buffer length: ${encryptedMovesBuffer.length} bytes`);

        // Decrypt the moves using the symmetric key and movesMade as nonce
        console.log('🔐 Decrypting moves...');
        const decryptedMovesBuffer = decodeData(encryptedMovesBuffer, movesMade, symmetricKey);
        console.log(`📦 Decrypted moves buffer length: ${decryptedMovesBuffer.length} bytes`);

        // Convert buffer to BigInt
        const decryptedMovesBigInt = bufferToBigint(decryptedMovesBuffer);
        console.log(`🔢 Decrypted moves as BigInt: ${decryptedMovesBigInt.toString()}`);

        // Convert BigInt to string for deserialization
        const decryptedMovesString = decryptedMovesBigInt.toString();
        console.log(`📝 Decrypted moves as string: ${decryptedMovesString}`);

        // Deserialize the moves
        console.log('🔄 Deserializing moves...');

        // Check if the decrypted string matches expected format
        if (!decryptedMovesString.startsWith('1') || decryptedMovesString.length < 11 || decryptedMovesString.length > 61) {
            console.log('⚠️  Warning: Decrypted data does not match expected serialized moves format');
            console.log(`   Expected: String starting with '1' and 11-61 digits`);
            console.log(`   Got: "${decryptedMovesString}" (${decryptedMovesString.length} characters)`);
            console.log('\n💡 This might indicate:');
            console.log('   - Incorrect movesMade value (nonce)');
            console.log('   - Incorrect symmetric key');
            console.log('   - Data encrypted with different parameters');
            console.log('   - Corrupted or invalid encrypted data');
            throw new Error('Decrypted data does not match expected serialized moves format');
        }

        const deserializedMoves = deserializeMoves(decryptedMovesString, teamEnum);
        console.log(`✅ Successfully deserialized ${deserializedMoves.length} moves`);

        return deserializedMoves;

    } catch (error) {
        console.error('❌ Error decoding moves:', error);
        throw error;
    }
}

/**
 * Formats and displays the decoded moves in a readable format
 * @param moves - Array of decoded GameAction objects
 */
function displayMoves(moves: any[]) {
    console.log('\n📋 Decoded Moves:');
    console.log('==================');

    if (moves.length === 0) {
        console.log('No moves found.');
        return;
    }

    moves.forEach((move, index) => {
        console.log(`\nMove ${index + 1}:`);
        console.log(`  Player ID: ${move.playerId}`);
        console.log(`  Team: ${move.teamEnum === TeamEnum.TEAM1 ? 'Team 1' : 'Team 2'}`);
        console.log(`  Move Type: ${move.moveType}`);
        console.log(`  From: (${move.oldPosition.x}, ${move.oldPosition.y})`);
        console.log(`  To: (${move.newPosition.x}, ${move.newPosition.y})`);
    });
}

// Main execution function
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log('Usage: yarn ts-node scripts/decode-moves.ts --moves <encryptedMovesHex> --key <symmetricKey> --movesmade <number> [--team <1|2>]');
        console.log('\nParameters:');
        console.log('  --moves <hex>     : Encrypted moves as hex string (with or without 0x prefix)');
        console.log('  --key <base64>    : Symmetric key for decryption (base64 encoded)');
        console.log('  --movesmade <num> : Number of moves made (used as nonce)');
        console.log('  --team <1|2>      : Team enum (optional, defaults to 1)');
        console.log('\nExamples:');
        console.log('  yarn ts-node scripts/decode-moves.ts --moves "0x1234..." --key "base64key..." --movesmade 5');
        console.log('  yarn ts-node scripts/decode-moves.ts --moves "1234..." --key "base64key..." --movesmade 3 --team 2');
        return;
    }

    // Parse command line arguments
    let encryptedMovesHex = '';
    let symmetricKey = '';
    let movesMade = 0;
    let teamEnum = TeamEnum.TEAM1;

    for (let i = 0; i < args.length; i += 2) {
        const flag = args[i];
        const value = args[i + 1];

        switch (flag) {
            case '--moves':
                encryptedMovesHex = value;
                break;
            case '--key':
                symmetricKey = value;
                break;
            case '--movesmade':
                movesMade = parseInt(value, 10);
                if (isNaN(movesMade) || movesMade < 0) {
                    console.error('❌ Invalid movesmade value. Must be a non-negative integer.');
                    return;
                }
                break;
            case '--team':
                const teamValue = parseInt(value, 10);
                if (teamValue === 1) {
                    teamEnum = TeamEnum.TEAM1;
                } else if (teamValue === 2) {
                    teamEnum = TeamEnum.TEAM2;
                } else {
                    console.error('❌ Invalid team value. Must be 1 or 2.');
                    return;
                }
                break;
            default:
                console.error(`❌ Unknown flag: ${flag}`);
                return;
        }
    }

    // Validate required parameters
    if (!encryptedMovesHex) {
        console.error('❌ Missing required parameter: --moves');
        return;
    }
    if (!symmetricKey) {
        console.error('❌ Missing required parameter: --key');
        return;
    }
    if (movesMade === undefined) {
        console.error('❌ Missing required parameter: --movesmade');
        return;
    }

    try {
        console.log('🚀 Starting move decoding script...\n');

        // Decode the moves
        const decodedMoves = decodeMoves(encryptedMovesHex, symmetricKey, movesMade, teamEnum);

        // Display the results
        displayMoves(decodedMoves);

        console.log('\n✅ Move decoding completed successfully!');

        // Return the decoded moves for potential further processing
        return decodedMoves;

    } catch (error) {
        console.error('\n❌ Script execution failed:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

export { decodeMoves, displayMoves };


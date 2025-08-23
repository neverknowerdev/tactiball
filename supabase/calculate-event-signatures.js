const fs = require('fs');
const path = require('path');
const { keccak256, toUtf8Bytes } = require('ethers');

// Read the TypeScript contract definition to get the exact event signatures
function readEventSignaturesFromArtifacts() {
    const artifactPath = path.join(__dirname, '../typechain-types/contracts/Game.sol/ChessBallGame.ts');

    if (!fs.existsSync(artifactPath)) {
        console.error('❌ Artifact file not found:', artifactPath);
        console.log('Please run "yarn hardhat compile" first to generate artifacts');
        return null;
    }

    const content = fs.readFileSync(artifactPath, 'utf8');

    // Extract event signatures from the TypeScript file
    const eventSignatures = [];

    // Look for event signatures in the filters section
    const filterMatches = content.match(/"([^"]+\([^)]*\))":/g);
    if (filterMatches) {
        filterMatches.forEach(match => {
            const signature = match.match(/"([^"]+)"/)[1];
            if (signature.includes('(') && !eventSignatures.includes(signature)) {
                eventSignatures.push(signature);
            }
        });
    }

    return eventSignatures;
}

// Calculate keccak256 hash for each event signature
function calculateEventSignatures(eventSignatures) {
    console.log('📋 Event Signatures from Artifacts:');
    console.log('=====================================\n');

    const results = [];

    eventSignatures.forEach(signature => {
        const hash = keccak256(toUtf8Bytes(signature));
        const eventName = signature.split('(')[0];

        console.log(`${eventName}:`);
        console.log(`  Signature: "${signature}"`);
        console.log(`  Hash: "${hash}"`);
        console.log('');

        results.push({
            eventName,
            signature,
            hash
        });
    });

    return results;
}

// Generate TypeScript code for AbiDecoder
function generateAbiDecoderCode(results) {
    console.log('\n🔧 Generated AbiDecoder Code:');
    console.log('================================\n');

    console.log('// Event signatures from artifacts (auto-generated)');
    console.log('export class AbiDecoder {');

    results.forEach(result => {
        const constName = result.eventName.toUpperCase() + '_SIGNATURE';
        console.log(`    private static readonly ${constName} = "${result.hash}"`);
    });

    console.log('');
    console.log('    static getEventSignature(eventName: string): string {');
    console.log('        switch (eventName) {');

    results.forEach(result => {
        console.log(`            case '${result.eventName}':`);
        console.log(`                return this.${result.eventName.toUpperCase()}_SIGNATURE`);
    });

    console.log('            default:');
    console.log('                throw new Error(`Unknown event: ${eventName}`)');
    console.log('        }');
    console.log('    }');
    console.log('}');
}

// Main execution
function main() {
    console.log('🚀 Enhanced Event Signature Calculator');
    console.log('=====================================\n');

    // Read event signatures from artifacts
    const eventSignatures = readEventSignaturesFromArtifacts();

    if (!eventSignatures || eventSignatures.length === 0) {
        console.error('❌ No event signatures found in artifacts');
        return;
    }

    console.log(`✅ Found ${eventSignatures.length} event signatures in artifacts\n`);

    // Calculate hashes
    const results = calculateEventSignatures(eventSignatures);

    // Generate AbiDecoder code
    generateAbiDecoderCode(results);

    console.log('\n✨ Done! Copy the generated code above to your AbiDecoder class');
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { readEventSignaturesFromArtifacts, calculateEventSignatures };

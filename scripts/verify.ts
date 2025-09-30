import { ethers, run } from "hardhat";

async function main() {
    console.log("=== Contract Verification ===");

    // Load deployment info
    const fs = require('fs');
    const deploymentFile = 'deployment.json';

    if (!fs.existsSync(deploymentFile)) {
        throw new Error("deployment.json not found. Please run deploy.ts first.");
    }

    const allDeployments = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
    const networkName = (await ethers.provider.getNetwork()).name;
    const deploymentInfo = allDeployments[networkName];

    if (!deploymentInfo) {
        throw new Error(`No deployment found for network: ${networkName}. Please run deploy.ts first.`);
    }

    console.log("Loaded deployment info:", deploymentInfo);

    // Step 1: Verify deployment on-chain
    console.log("\n=== Step 1: On-Chain Deployment Verification ===");

    try {
        const GameLib = await ethers.getContractAt("GameLib", deploymentInfo.libraries.gameLib);
        console.log("✅ GameLib accessible at:", deploymentInfo.libraries.gameLib);
    } catch (error: any) {
        console.log("❌ GameLib verification failed:", error.message);
    }

    try {
        const ChessBallGame = await ethers.getContractAt("ChessBallGame", deploymentInfo.proxyAddress);
        console.log("✅ ChessBallGame proxy accessible at:", deploymentInfo.proxyAddress);

        const relayerAddress = await ChessBallGame.relayerAddress();
        const owner = await ChessBallGame.owner();

        console.log("✅ Relayer address:", relayerAddress);
        console.log("✅ Owner:", owner);
    } catch (error: any) {
        console.log("❌ ChessBallGame verification failed:", error.message);
    }

    // Step 2: Verify on Block Explorer (if API key is available)
    const explorerName = networkName === 'worldchain' ? 'Worldscan' : 'Basescan';
    console.log(`\n=== Step 2: ${explorerName} Verification ===`);

    if (!process.env.ETHERSCAN_API_KEY) {
        console.log(`ℹ️  ETHERSCAN_API_KEY not set. Skipping ${explorerName} verification.`);
        console.log(`   To verify on ${explorerName}, add your API key to .env file`);
        if (networkName === 'worldchain') {
            console.log("   Get it from: https://worldscan.org/apis");
        } else {
            console.log("   Get it from: https://basescan.org/apis");
        }
        return;
    }

    console.log(`✅ ETHERSCAN_API_KEY found. Starting verification on ${explorerName}...`);

    // Verify GameLib
    try {
        console.log(`Verifying GameLib on ${explorerName}...`);
        await run("verify:verify", {
            address: deploymentInfo.libraries.gameLib,
            contract: "contracts/GameLib.sol:GameLib",
            constructorArguments: [],
            network: networkName
        });
        console.log(`✅ GameLib verified on ${explorerName}!`);
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`ℹ️  GameLib already verified on ${explorerName}`);
        } else {
            console.log(`❌ GameLib verification failed:`, error.message);
        }
    }

    // Verify Implementation
    try {
        console.log(`Verifying Implementation on ${explorerName}...`);
        await run("verify:verify", {
            address: deploymentInfo.implementationAddress,
            contract: "contracts/Game.sol:ChessBallGame",
            constructorArguments: [],
            libraries: {
                GameLib: deploymentInfo.libraries.gameLib
            },
            network: networkName
        });
        console.log(`✅ Implementation verified on ${explorerName}!`);
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`ℹ️  Implementation already verified on ${explorerName}`);
        } else {
            console.log(`❌ Implementation verification failed:`, error.message);
        }
    }

    // Verify Proxy Contract
    try {
        console.log(`Verifying Proxy Contract on ${explorerName}...`);
        await run("verify:verify", {
            address: deploymentInfo.proxyAddress,
            contract: "contracts/Game.sol:ChessBallGame",
            constructorArguments: [],
            libraries: {
                GameLib: deploymentInfo.libraries.gameLib
            },
            network: networkName
        });
        console.log(`✅ Proxy Contract verified on ${explorerName}!`);
    } catch (error: any) {
        if (error.message.includes("Already Verified")) {
            console.log(`ℹ️  Proxy Contract already verified on ${explorerName}`);
        } else {
            console.log(`❌ Proxy Contract verification failed:`, error.message);
        }
    }

    console.log("\n=== Verification Complete ===");
    console.log("🔗 Contract Addresses:");
    console.log(`   EloCalculationLib: ${deploymentInfo.libraries.eloCalculationLib}`);
    console.log(`   GameLib: ${deploymentInfo.libraries.gameLib}`);
    console.log(`   Implementation: ${deploymentInfo.implementationAddress}`);
    console.log(`   Proxy: ${deploymentInfo.proxyAddress}`);

    console.log("\n🌐 Block Explorer URLs:");
    let explorerUrl: string;
    switch (networkName) {
        case 'baseMainnet':
            explorerUrl = 'https://basescan.org';
            break;
        case 'baseSepolia':
            explorerUrl = 'https://sepolia.basescan.org';
            break;
        case 'worldchain':
            explorerUrl = 'https://worldscan.org';
            break;
        default:
            explorerUrl = 'https://basescan.org';
    }

    console.log(`   EloCalculationLib: ${explorerUrl}/address/${deploymentInfo.libraries.eloCalculationLib}`);
    console.log(`   GameLib: ${explorerUrl}/address/${deploymentInfo.libraries.gameLib}`);
    console.log(`   Implementation: ${explorerUrl}/address/${deploymentInfo.implementationAddress}`);
    console.log(`   Proxy: ${explorerUrl}/address/${deploymentInfo.proxyAddress}`);
}

// Run verification if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Verification failed:", error);
            process.exit(1);
        });
}

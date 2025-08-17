import { ethers, upgrades } from "hardhat";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

// Helper function to get source code hash
function getSourceCodeHash(filePath: string): string {
    try {
        const content = readFileSync(filePath, 'utf8');
        // Remove comments and normalize whitespace for better comparison
        const normalizedContent = content
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/.*$/gm, '') // Remove line comments
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
        return createHash('sha256').update(normalizedContent).digest('hex');
    } catch (error) {
        console.log(`⚠️  Could not read source file: ${filePath}`);
        return '';
    }
}

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("=== Upgrading Contracts with Smart Library Handling ===");
    console.log("Upgrading contracts with the account:", deployer.address);
    console.log("Network:", await ethers.provider.getNetwork());

    // Load current deployment info
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

    console.log("Loaded current deployment info:", deploymentInfo);

    const proxyAddress = deploymentInfo.proxyAddress;
    console.log("Proxy address:", proxyAddress);

    // Get current gas price and add buffer for Base Sepolia
    const gasPrice = await ethers.provider.getFeeData();
    const adjustedGasPrice = gasPrice.gasPrice ? gasPrice.gasPrice * 150n / 100n : undefined;
    console.log("Current gas price:", gasPrice.gasPrice?.toString());
    console.log("Using adjusted gas price:", adjustedGasPrice?.toString());

    // Step 1: Check if libraries need updating using source code comparison
    console.log("\n=== Step 1: Library Source Code Analysis ===");

    let eloCalculationLibAddress = deploymentInfo.libraries.eloCalculationLib;
    let gameLibAddress = deploymentInfo.libraries.gameLib;
    let librariesUpdated = false;

    // Check if EloCalculationLib source code has changed
    console.log("Checking EloCalculationLib source code...");
    const eloLibPath = join(__dirname, '../contracts/EloCalculationLib.sol');
    const currentEloHash = deploymentInfo.eloCalculationLibHash || 'unknown';
    const newEloHash = getSourceCodeHash(eloLibPath);

    if (newEloHash && newEloHash !== currentEloHash) {
        console.log("🔄 EloCalculationLib source code changed - deploying updated version...");
        console.log(`   Previous hash: ${currentEloHash.substring(0, 8)}...`);
        console.log(`   New hash: ${newEloHash.substring(0, 8)}...`);

        const EloCalculationLib = await ethers.getContractFactory("EloCalculationLib");
        const eloCalculationLib = await EloCalculationLib.deploy({
            gasPrice: adjustedGasPrice
        });
        await eloCalculationLib.waitForDeployment();
        eloCalculationLibAddress = await eloCalculationLib.getAddress();
        console.log("✅ Updated EloCalculationLib deployed to:", eloCalculationLibAddress);
        librariesUpdated = true;
    } else {
        console.log("✅ EloCalculationLib source code unchanged - reusing existing:", eloCalculationLibAddress);
    }

    // Check if GameLib source code has changed
    console.log("Checking GameLib source code...");
    const gameLibPath = join(__dirname, '../contracts/GameLib.sol');
    const currentGameHash = deploymentInfo.gameLibHash || 'unknown';
    const newGameHash = getSourceCodeHash(gameLibPath);

    if (newGameHash && newGameHash !== currentGameHash) {
        console.log("🔄 GameLib source code changed - deploying updated version...");
        console.log(`   Previous hash: ${currentGameHash.substring(0, 8)}...`);
        console.log(`   New hash: ${newGameHash.substring(0, 8)}...`);

        const GameLib = await ethers.getContractFactory("GameLib", {
            libraries: {
                EloCalculationLib: eloCalculationLibAddress
            }
        });
        const gameLib = await GameLib.deploy({
            gasPrice: adjustedGasPrice
        });
        await gameLib.waitForDeployment();
        gameLibAddress = await gameLib.getAddress();
        console.log("✅ Updated GameLib deployed to:", gameLibAddress);
        librariesUpdated = true;
    } else {
        console.log("✅ GameLib source code unchanged - reusing existing:", gameLibAddress);
    }

    // Add a flag to force library updates if needed
    const forceLibraryUpdate = process.env.FORCE_LIBRARY_UPDATE === "true";
    if (forceLibraryUpdate) {
        console.log("🔄 FORCE_LIBRARY_UPDATE flag detected - deploying new libraries...");

        // Force deploy new EloCalculationLib
        const EloCalculationLib = await ethers.getContractFactory("EloCalculationLib");
        const eloCalculationLib = await EloCalculationLib.deploy({
            gasPrice: adjustedGasPrice
        });
        await eloCalculationLib.waitForDeployment();
        eloCalculationLibAddress = await eloCalculationLib.getAddress();
        console.log("✅ Forced new EloCalculationLib deployed to:", eloCalculationLibAddress);

        // Force deploy new GameLib
        const GameLib = await ethers.getContractFactory("GameLib", {
            libraries: {
                EloCalculationLib: eloCalculationLibAddress
            }
        });
        const gameLib = await GameLib.deploy({
            gasPrice: adjustedGasPrice
        });
        await gameLib.waitForDeployment();
        gameLibAddress = await gameLib.getAddress();
        console.log("✅ Forced new GameLib deployed to:", gameLibAddress);

        librariesUpdated = true;
    }

    if (librariesUpdated) {
        console.log("⏳ Waiting 5 seconds after library updates...");
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Step 2: Deploy new implementation with current libraries
    console.log("\n=== Step 2: Deploying New Implementation ===");

    const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame", {
        libraries: {
            GameLib: gameLibAddress,
            EloCalculationLib: eloCalculationLibAddress
        }
    });

    const newImplementation = await ChessBallGameV2.deploy({
        gasPrice: adjustedGasPrice
    });
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log("✅ New implementation deployed to:", newImplementationAddress);

    // Wait a bit before upgrade
    console.log("⏳ Waiting 5 seconds before upgrade...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 3: Upgrade the proxy to the new implementation
    console.log("\n=== Step 3: Upgrading Proxy ===");

    console.log("Upgrading proxy to new implementation...");
    const upgraded = await upgrades.upgradeProxy(proxyAddress, ChessBallGameV2, {
        unsafeAllowLinkedLibraries: true
    });
    await upgraded.waitForDeployment();
    console.log("✅ ChessBallGame upgraded successfully!");

    // Get the new implementation address from the proxy
    const actualImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("New implementation address from proxy:", actualImplementationAddress);

    // Step 4: Verify the upgrade
    console.log("\n=== Step 4: Verifying Upgrade ===");

    try {
        const contract = await ethers.getContractAt("ChessBallGame", proxyAddress);
        const owner = await contract.owner();
        const gelatoAddress = await contract.gelatoAddress();
        const relayerAddress = await contract.relayerAddress();

        console.log("✅ Contract owner after upgrade:", owner);
        console.log("✅ Gelato address after upgrade:", gelatoAddress);
        console.log("✅ Relayer address after upgrade:", relayerAddress);
        console.log("✅ Upgrade verification successful!");
    } catch (error: any) {
        console.error("❌ Error verifying upgrade:", error.message);
    }

    // Step 5: Update deployment info
    console.log("\n=== Step 5: Updating Deployment Info ===");

    const newDeploymentInfo = {
        ...deploymentInfo,
        implementationAddress: actualImplementationAddress,
        libraries: {
            eloCalculationLib: eloCalculationLibAddress,
            gameLib: gameLibAddress
        },
        eloCalculationLibHash: newEloHash,
        gameLibHash: newGameHash,
        upgradeTimestamp: new Date().toISOString(),
        previousImplementation: deploymentInfo.implementationAddress,
        previousLibraries: deploymentInfo.libraries,
        librariesUpdated: librariesUpdated
    };

    // Update the deployment info for the current network while preserving other networks
    allDeployments[networkName] = newDeploymentInfo;
    fs.writeFileSync('deployment.json', JSON.stringify(allDeployments, null, 2));
    console.log("✅ Updated deployment info saved to deployment.json");

    // Display upgrade summary
    console.log("\n=== Upgrade Summary ===");
    console.log("📋 Previous vs New:");
    console.log(`   EloCalculationLib: ${deploymentInfo.libraries.eloCalculationLib} → ${eloCalculationLibAddress}`);
    console.log(`   GameLib: ${deploymentInfo.libraries.gameLib} → ${gameLibAddress}`);
    console.log(`   Implementation: ${deploymentInfo.implementationAddress} → ${actualImplementationAddress}`);
    console.log(`   Proxy: ${proxyAddress} (unchanged)`);

    if (librariesUpdated) {
        console.log("\n🔄 Libraries were updated during this upgrade");
    } else {
        console.log("\n✅ All libraries were unchanged - reused existing versions");
    }

    console.log("\n🔗 Final Contract Addresses:");
    console.log(`   EloCalculationLib: ${eloCalculationLibAddress}`);
    console.log(`   GameLib: ${gameLibAddress}`);
    console.log(`   Implementation: ${actualImplementationAddress}`);
    console.log(`   Proxy: ${proxyAddress}`);

    console.log("\n🌐 Basescan Explorer URLs:");
    console.log(`   EloCalculationLib: https://sepolia.basescan.org/address/${eloCalculationLibAddress}`);
    console.log(`   GameLib: https://sepolia.basescan.org/address/${gameLibAddress}`);
    console.log(`   Implementation: https://sepolia.basescan.org/address/${actualImplementationAddress}`);
    console.log(`   Proxy: https://sepolia.basescan.org/address/${proxyAddress}`);

    console.log("\n🎉 Upgrade completed successfully!");
    console.log("💡 Run 'yarn hardhat run scripts/verify.ts --network baseSepolia' to verify the upgrade");
}

// Run upgrade if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error("❌ Upgrade failed:", error);
            process.exit(1);
        });
}

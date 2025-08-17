import { ethers, upgrades } from "hardhat";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const GELATO_ADDRESS = "0x12EBb8C121b706aE6368147afc5B54702cB26637";
const RELAYER_ADDRESS = "0xc510350904b2fD01D9af92342f49a3c7aEC47739";

// Helper function to add delay between transactions
function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Network:", await ethers.provider.getNetwork());



    // Step 1: Deploy libraries first
    console.log("\n=== Deploying Libraries ===");

    // Deploy EloCalculationLib
    console.log("Deploying EloCalculationLib...");
    const EloCalculationLib = await ethers.getContractFactory("EloCalculationLib");
    const eloCalculationLib = await EloCalculationLib.deploy();
    await eloCalculationLib.waitForDeployment();
    const eloCalculationLibAddress = await eloCalculationLib.getAddress();
    console.log("EloCalculationLib deployed to:", eloCalculationLibAddress);

    // Wait a bit before next deployment
    console.log("Waiting 5 seconds before next deployment...");
    await delay(5000);

    // Deploy GameLib (which depends on EloCalculationLib)
    console.log("Deploying GameLib...");
    const GameLib = await ethers.getContractFactory("GameLib", {
        libraries: {
            EloCalculationLib: eloCalculationLibAddress
        }
    });
    const gameLib = await GameLib.deploy();
    await gameLib.waitForDeployment();
    const gameLibAddress = await gameLib.getAddress();
    console.log("GameLib deployed to:", gameLibAddress);

    // Wait a bit before next deployment
    console.log("Waiting 5 seconds before next deployment...");
    await delay(5000);

    // Step 2: Deploy the implementation contract first
    console.log("\n=== Deploying Implementation Contract ===");

    const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
        libraries: {
            GameLib: gameLibAddress,
            EloCalculationLib: eloCalculationLibAddress
        }
    });

    const implementation = await ChessBallGame.deploy();
    await implementation.waitForDeployment();
    const implementationAddress = await implementation.getAddress();
    console.log("Implementation deployed to:", implementationAddress);

    // Wait a bit before next deployment
    console.log("Waiting 5 seconds before next deployment...");
    await delay(5000);

    // Step 3: Deploy the proxy contract
    console.log("\n=== Deploying Proxy Contract ===");

    const constructorArgs = [
        GELATO_ADDRESS,
        RELAYER_ADDRESS
    ];

    // Deploy using UUPS proxy pattern
    const chessBallGame = await upgrades.deployProxy(ChessBallGame, constructorArgs, {
        kind: 'uups',
        initializer: 'initialize',
        unsafeAllowLinkedLibraries: true
    });

    await chessBallGame.waitForDeployment();

    const proxyAddress = await chessBallGame.getAddress();

    console.log("ChessBallGame deployed to:", proxyAddress);
    console.log("Implementation deployed to:", implementationAddress);
    console.log("Proxy deployed to:", proxyAddress);

    // Step 4: Verify the deployment
    console.log("\n=== Verifying Deployment ===");

    try {
        const gelatoAddress = await chessBallGame.gelatoAddress();
        const relayerAddress = await chessBallGame.relayerAddress();
        const owner = await chessBallGame.owner();

        console.log("Gelato address:", gelatoAddress);
        console.log("Relayer address:", relayerAddress);
        console.log("Owner:", owner);
    } catch (error: any) {
        console.log("Warning: Could not verify contract state. This might be due to proxy initialization issues.");
        console.log("Error details:", error.message);
    }

    // Verify library addresses are correctly linked
    console.log("\n=== Library Verification ===");
    console.log("Expected EloCalculationLib address:", eloCalculationLibAddress);
    console.log("Expected GameLib address:", gameLibAddress);

    // Step 5: Calculate source code hashes for future comparisons
    console.log("\n=== Calculating Source Code Hashes ===");

    const eloLibPath = join(__dirname, '../contracts/EloCalculationLib.sol');
    const gameLibPath = join(__dirname, '../contracts/GameLib.sol');

    const eloHash = getSourceCodeHash(eloLibPath);
    const gameHash = getSourceCodeHash(gameLibPath);

    console.log("EloCalculationLib source hash:", eloHash.substring(0, 8) + "...");
    console.log("GameLib source hash:", gameHash.substring(0, 8) + "...");

    // Save deployment info
    const deploymentInfo = {
        network: (await ethers.provider.getNetwork()).name,
        chainId: (await ethers.provider.getNetwork()).chainId.toString(),
        proxyAddress: proxyAddress,
        implementationAddress: implementationAddress,
        libraries: {
            eloCalculationLib: eloCalculationLibAddress,
            gameLib: gameLibAddress
        },
        deployer: deployer.address,

        timestamp: new Date().toISOString(),
        // Store actual source code hashes for future comparisons
        eloCalculationLibHash: eloHash,
        gameLibHash: gameHash
    };

    console.log("\n=== Deployment Summary ===");
    console.log(JSON.stringify(deploymentInfo, null, 2));

    // Save to deployment.json file, preserving other networks
    const fs = require('fs');
    const path = require('path');
    const deploymentFile = 'deployment.json';

    let allDeployments: Record<string, any> = {};
    if (fs.existsSync(deploymentFile)) {
        try {
            const existingContent = fs.readFileSync(deploymentFile, 'utf8');
            allDeployments = JSON.parse(existingContent);
        } catch (error) {
            console.log("⚠️  Could not parse existing deployment.json, starting fresh");
            allDeployments = {};
        }
    }

    // Add/update deployment for current network
    const networkKey = `baseSepolia`; // Use network name as key
    allDeployments[networkKey] = deploymentInfo;

    fs.writeFileSync(deploymentFile, JSON.stringify(allDeployments, null, 2));
    console.log(`\nDeployment info saved to deployment.json under network: ${networkKey}`);
    console.log(`📁 File now contains deployments for ${Object.keys(allDeployments).length} network(s)`);
}

// Export function for use in other scripts
export {
    main as deploy
};

// Run deployment if this script is executed directly
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

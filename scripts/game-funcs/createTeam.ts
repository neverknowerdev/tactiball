import { ethers } from "hardhat";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function main() {
    // Check if private key is provided
    const privateKey = process.env.WALLET_PRIVATE_KEY;
    if (!privateKey) {
        throw new Error("WALLET_PRIVATE_KEY environment variable is required");
    }

    // Get command line arguments
    const args = process.argv.slice(2);
    const teamName = args[0] || "My Team";
    const country = parseInt(args[1]) || 1;

    // Validate country code
    if (country > 255) {
        throw new Error("Country code must be between 1 and 255");
    }

    // Get the deployed contract address from deployment.json
    const deploymentData = require("../../deployment.json");
    const contractAddress = deploymentData.proxyAddress;
    const network = deploymentData.network;
    const chainId = deploymentData.chainId;

    console.log(`Creating team on ${network} (Chain ID: ${chainId})`);
    console.log(`Contract address: ${contractAddress}`);

    // Create a wallet instance from the private key
    const wallet = new ethers.Wallet(privateKey);
    console.log(`Using wallet: ${wallet.address}`);

    // Connect to the provider
    const provider = new ethers.JsonRpcProvider(process.env.BASE_SEPOLIA_RPC_URL);
    const connectedWallet = wallet.connect(provider);

    // Get the contract factory and attach to the deployed address
    const ChessBallGame = await ethers.getContractFactory("ChessBallGame");
    const gameContract = ChessBallGame.attach(contractAddress).connect(connectedWallet);

    console.log(`\nCreating team with name: "${teamName}" and country: ${country}`);

    try {
        // Get current gas price and add buffer for Base Sepolia
        const gasPrice = await provider.getFeeData();
        const adjustedGasPrice = gasPrice.gasPrice ? gasPrice.gasPrice * 150n / 100n : undefined;

        console.log(`Current gas price: ${gasPrice.gasPrice?.toString()}`);
        console.log(`Using adjusted gas price: ${adjustedGasPrice?.toString()}`);

        // Create the team
        const tx = await gameContract.createTeam(teamName, country, {
            gasPrice: adjustedGasPrice
        });

        console.log(`Transaction hash: ${tx.hash}`);
        console.log("Waiting for transaction confirmation...");

        // Wait for the transaction to be mined
        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt?.blockNumber}`);

        // Get the team ID from the wallet mapping
        const teamId = await gameContract.teamIdByWallet(connectedWallet.address);
        console.log(`\n✅ Team created successfully!`);
        console.log(`Team ID: ${teamId}`);
        console.log(`Team Name: ${teamName}`);
        console.log(`Country: ${country}`);
        console.log(`Owner: ${connectedWallet.address}`);

    } catch (error) {
        console.error("❌ Error creating team:", error);
        process.exit(1);
    }
}

// Run the script
main()
    .then(() => {
        console.log("\n🎉 Script completed successfully!");
        process.exit(0);
    })
    .catch((error) => {
        console.error("💥 Script failed:", error);
        process.exit(1);
    });

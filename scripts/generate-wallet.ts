import { ethers } from "hardhat";

async function main() {
    // Generate a new random wallet
    const wallet = ethers.Wallet.createRandom();

    console.log("🔐 New Wallet Generated");
    console.log("=========================");
    console.log(`Private Key: ${wallet.privateKey}`);
    console.log(`Address: ${wallet.address}`);
    console.log(`Mnemonic: ${wallet.mnemonic?.phrase || "N/A"}`);
    console.log("");
    console.log("⚠️  IMPORTANT: Keep your private key secure and never share it!");
    console.log("💡 You can use this wallet for testing or development purposes.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

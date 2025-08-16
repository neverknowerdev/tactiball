import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Upgrading contract with the account:", deployer.address);

    // Get the proxy address from environment or hardhat config
    const proxyAddress = process.env.PROXY_ADDRESS || "YOUR_PROXY_ADDRESS_HERE";

    if (proxyAddress === "YOUR_PROXY_ADDRESS_HERE") {
        console.error("Please set PROXY_ADDRESS environment variable or update the script");
        process.exit(1);
    }

    console.log("Proxy address:", proxyAddress);

    // Deploy the new implementation
    const ChessBallGameV2 = await ethers.getContractFactory("ChessBallGame");
    console.log("Deploying new implementation...");

    // Upgrade the proxy to the new implementation
    const upgraded = await upgrades.upgradeProxy(proxyAddress, ChessBallGameV2);
    console.log("ChessBallGame upgraded successfully!");

    // Get the new implementation address
    const newImplementationAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("New implementation deployed to:", newImplementationAddress);

    // Verify the upgrade by calling a function
    try {
        const contract = ChessBallGameV2.attach(proxyAddress);
        const owner = await contract.owner();
        console.log("Contract owner after upgrade:", owner);
        console.log("Upgrade verification successful!");
    } catch (error) {
        console.error("Error verifying upgrade:", error);
    }
}

// Import upgrades from hardhat-upgrades
const { upgrades } = require("@openzeppelin/hardhat-upgrades");

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

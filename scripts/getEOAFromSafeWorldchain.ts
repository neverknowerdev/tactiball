import { ethers } from "hardhat";

async function main() {
    // Get the Safe address from environment variable or command line arguments
    const safeAddress = "0x69A66B4398aC13bfB4649eb4656bE4D458f78946"

    // Validate address format
    if (!ethers.isAddress(safeAddress)) {
        console.error("Invalid address format:", safeAddress);
        process.exit(1);
    }

    console.log("Querying Safe address:", safeAddress);

    // Minimal ABI for getOwners
    const abi = [
        "function getOwners() view returns (address[])"
    ];

    // Get provider from Hardhat (will use the configured network)
    const provider = ethers.provider;

    // Contract instance
    const safeContract = new ethers.Contract(safeAddress, abi, provider);

    try {
        // Call getOwners (view call, no gas needed)
        const owners = await safeContract.getOwners();
        const eoa = owners[0]; // Single owner for WorldApp

        console.log("EOA Address:", eoa);
        return eoa;
    } catch (error) {
        console.error("Error querying Safe:", error.message);
        // Common issues: Invalid Safe address, wrong network, or RPC rate limit
        process.exit(1);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
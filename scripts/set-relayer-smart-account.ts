import { ethers } from "hardhat";
import { ChessBallGame } from "../typechain-types";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Setting relayer smart account address with account:", deployer.address);

    // Contract address from deployment.json
    const contractAddress = "0x5582A4C5a7e1d1997189774Cb1785aCb3d1E063d";
    const relayerSmartAccountAddress = "0x6920946D9254072E495717Da833f106d695859AE";

    // Get the contract instance
    const chessBallGame = await ethers.getContractAt("ChessBallGame", contractAddress) as ChessBallGame;

    console.log("Setting relayer smart account address to:", relayerSmartAccountAddress);

    // Call the setter function
    const tx = await chessBallGame.setRelayerSmartAccountAddress(relayerSmartAccountAddress);
    console.log("Transaction hash:", tx.hash);

    // Wait for the transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt?.blockNumber);

    // Verify the address was set
    const setAddress = await chessBallGame.relayerSmartAccountAddress();
    console.log("Relayer smart account address set to:", setAddress);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

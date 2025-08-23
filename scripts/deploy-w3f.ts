import { w3f } from "hardhat";

async function main() {
    const gameWorkerFunc = w3f.get('game-worker');
    const gameWorkerCID = await gameWorkerFunc.deploy();
    console.log('gameWorkerCID CID', gameWorkerCID);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
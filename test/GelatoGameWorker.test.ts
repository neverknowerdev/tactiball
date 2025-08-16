import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { assert, expect } from "chai";
import { ethers, w3f } from "hardhat";
import { generateEventLog } from "./tools/helpers";
import { isPosEquals } from "../frontend/src/lib/game";

describe("Gelato Game Worker", function () {
    let gameContract: any;
    let owner: any;
    let team1Owner: any;
    let team2Owner: any;
    let relayerAddress: any;
    let gelatoAddress: any;

    beforeEach(async function () {
        [owner, team1Owner, team2Owner, relayerAddress, gelatoAddress] = await ethers.getSigners();

        // Deploy libraries first
        const eloLib = await ethers.deployContract("EloCalculationLib");
        await eloLib.waitForDeployment();

        const gameLib = await ethers.deployContract("GameLib", {
            libraries: {
                EloCalculationLib: await eloLib.getAddress(),
            },
        });
        await gameLib.waitForDeployment();

        // Deploy the main contract with linked libraries
        gameContract = await ethers.deployContract("ChessBallGame", [
            gelatoAddress.address, // gelatoAddress - using owner for testing
            relayerAddress.address // relayerAddress - using owner for testing
        ], {
            libraries: {
                EloCalculationLib: await eloLib.getAddress(),
                GameLib: await gameLib.getAddress(),
            },
        });
        await gameContract.waitForDeployment();
    });

    describe('Gelato Game Worker', function () {
        it('should run successfully', async function () {
            await gameContract.connect(team1Owner).createTeam("Team Alpha", 1n).then((tx: any) => tx.wait());
            await gameContract.connect(team2Owner).createTeam("Team Beta", 2n).then((tx: any) => tx.wait());

            const team1Id = await gameContract.getTeamIdByWallet(team1Owner.address);
            const team2Id = await gameContract.getTeamIdByWallet(team2Owner.address);

            expect(team1Id).to.be.greaterThan(0);
            expect(team2Id).to.be.greaterThan(0);

            console.log("team1Id", team1Id);
            console.log("team2Id", team2Id);

            const tx = await gameContract.connect(team1Owner).createGameRequest(team1Id, team2Id);
            const receipt = await tx.wait();

            // Get event data from transaction receipt
            const event = receipt.logs.find((log: any) => log.fragment?.name === "GameRequestCreated");
            assert(event, "GameRequestCreated event not found");
            const gameRequestId = event.args[0];

            expect(gameRequestId).to.be.greaterThan(0);

            console.log("gameRequestId", gameRequestId);

            const tx2 = await gameContract.connect(team2Owner).startGame(gameRequestId);
            const receipt2 = await tx2.wait();

            const eventGameStarted = receipt2.logs.find((log: any) => log.fragment?.name === "GameStarted");
            const eventGameActionCommitted = receipt2.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");

            assert(eventGameStarted, "GameStarted event not found");
            assert(eventGameActionCommitted, "gameActionCommitted event not found");

            const gameId = eventGameStarted.args[0];

            console.log("gameId", gameId);

            expect(gameId).to.be.greaterThan(0);

            console.log("eventGameActionCommitted", eventGameActionCommitted);

            const oracleW3f: Web3FunctionHardhat = w3f.get("game-worker");
            let { result, storage } = await oracleW3f.run("onRun", {
                userArgs: {
                    "smartContractAddress": gameContract.target,
                },
                log: eventGameActionCommitted
            });

            expect(result.canExec).to.be.true;

            for (let calldata of (result as any).callData) {
                const tx = await gelatoAddress.sendTransaction({ to: calldata.to, data: calldata.data });
                const receipt = await tx.wait();
            }

            const gameInfo = await gameContract.getGame(gameId);
            expect(gameInfo.history.length).to.be.greaterThan(0);
            expect(gameInfo.history[0].team1Positions.length).to.be.equal(6);
            expect(gameInfo.history[0].team2Positions.length).to.be.equal(6);
            expect(gameInfo.history[0].ballPosition.x).to.be.equal(8);
            expect(gameInfo.history[0].ballPosition.y).to.be.equal(5);
            expect(gameInfo.history[0].ballOwner).to.be.equal(1);
            expect(gameInfo.history[0].stateType).to.be.equal(0);

            expect(isPosEquals(gameInfo.history[0].team1Positions[0], { x: 1, y: 5 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team1Positions[1], { x: 4, y: 2 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team1Positions[2], { x: 4, y: 8 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team1Positions[3], { x: 6, y: 3 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team1Positions[4], { x: 6, y: 7 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team1Positions[5], { x: 8, y: 5 })).to.be.true;

            expect(isPosEquals(gameInfo.history[0].team2Positions[0], { x: 15, y: 5 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team2Positions[1], { x: 12, y: 2 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team2Positions[2], { x: 12, y: 8 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team2Positions[3], { x: 10, y: 2 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team2Positions[4], { x: 10, y: 8 })).to.be.true;
            expect(isPosEquals(gameInfo.history[0].team2Positions[5], { x: 10, y: 5 })).to.be.true;


            const commitActionsTx1 = await gameContract.connect(team1Owner).commitGameActions(gameId, 1, [
                {
                    playerId: 5,
                    moveType: 0,
                    oldPosition: { x: 8, y: 5 },
                    newPosition: { x: 8, y: 3 }
                },
                {
                    playerId: 3,
                    moveType: 2, // run
                    oldPosition: { x: 6, y: 3 },
                    newPosition: { x: 8, y: 3 }
                }
            ]);
            const commitActionsReceipt1 = await commitActionsTx1.wait();
            const event1 = commitActionsReceipt1.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");
            expect(event1).to.be.not.null;

            const commitActionsTx2 = await gameContract.connect(team2Owner).commitGameActions(gameId, 2, [
                {
                    playerId: 3,
                    moveType: 1,
                    oldPosition: { x: 10, y: 2 },
                    newPosition: { x: 10, y: 3 }
                },
                {
                    playerId: 4,
                    moveType: 1,
                    oldPosition: { x: 10, y: 8 },
                    newPosition: { x: 10, y: 7 }
                }
            ]);
            const commitActionsReceipt2 = await commitActionsTx2.wait();
            const eventGameActionCommitted2 = commitActionsReceipt2.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");
            assert(eventGameActionCommitted2, "gameActionCommitted event not found");

            let { result: result2 } = await oracleW3f.run("onRun", {
                userArgs: {
                    "smartContractAddress": gameContract.target,
                },
                log: eventGameActionCommitted2
            });

            expect(result2.canExec).to.be.true;

            for (let calldata of (result2 as any).callData) {
                const tx = await gelatoAddress.sendTransaction({ to: calldata.to, data: calldata.data });
                const receipt = await tx.wait();
            }

            const gameInfo2 = await gameContract.getGame(gameId);
            expect(gameInfo2.history.length).to.be.equal(2);
            expect(gameInfo2.history[1].team1Positions.length).to.be.equal(6);
            expect(gameInfo2.history[1].team2Positions.length).to.be.equal(6);
            expect(gameInfo2.history[1].ballPosition.x).to.be.equal(8);
            expect(gameInfo2.history[1].ballPosition.y).to.be.equal(3);
            expect(gameInfo2.history[1].ballOwner).to.be.equal(1);
            expect(gameInfo2.history[1].stateType).to.be.equal(1);

            expect(isPosEquals(gameInfo2.history[1].team1Positions[0], { x: 1, y: 5 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team1Positions[1], { x: 4, y: 2 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team1Positions[2], { x: 4, y: 8 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team1Positions[3], { x: 8, y: 3 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team1Positions[4], { x: 6, y: 7 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team1Positions[5], { x: 8, y: 5 })).to.be.true;

            expect(isPosEquals(gameInfo2.history[1].team2Positions[0], { x: 15, y: 5 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team2Positions[1], { x: 12, y: 2 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team2Positions[2], { x: 12, y: 8 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team2Positions[3], { x: 10, y: 3 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team2Positions[4], { x: 10, y: 7 })).to.be.true;
            expect(isPosEquals(gameInfo2.history[1].team2Positions[5], { x: 10, y: 5 })).to.be.true;


        });
    });
});

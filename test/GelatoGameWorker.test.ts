import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { assert, expect } from "chai";
import { ethers, w3f } from "hardhat";
import { generateEventLog } from "./tools/helpers";
import { isPosEquals } from "../frontend/lib/game";

import { upgrades } from "hardhat";



const MoveType = {
    PASS: 0,
    TACKLE: 1,
    RUN: 2,
    SHOT: 3

} as const;

// Smart contract constants
const StateType = {
    START_POSITIONS: 0,
    MOVE: 1,
    GOAL_TEAM1: 2,
    GOAL_TEAM2: 3
} as const;

const TeamEnum = {
    NONE: 0,
    TEAM1: 1,
    TEAM2: 2
} as const;

const GameStatus = {
    NONE: 0,
    ACTIVE: 1,
    FINISHED: 2,
    FINISHED_BY_TIMEOUT: 3
} as const;

const FinishReason = {
    MAX_MOVES_REACHED: 0,
    MOVE_TIMEOUT: 1
} as const;

const TeamFormation = {
    FORMATION_2_2_1: 0
} as const;

const ErrorType = {
    UNSPECIFIED: 0,
    MOVE_VALIDATION_ERROR: 1
} as const;


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

        // Deploy the main contract using the upgradeable pattern
        const ChessBallGame = await ethers.getContractFactory("ChessBallGame", {
            libraries: {
                EloCalculationLib: await eloLib.getAddress(),
                GameLib: await gameLib.getAddress(),
            },
        });

        // Deploy using UUPS proxy pattern
        gameContract = await upgrades.deployProxy(ChessBallGame, [
            gelatoAddress.address, // gelatoAddress - using owner for testing
            relayerAddress.address // relayerAddress - using owner for testing
        ], {
            kind: 'uups',
            initializer: 'initialize',
            unsafeAllowLinkedLibraries: true
        });
        await gameContract.waitForDeployment();
    });

    // Reusable function to simulate a game move and process it
    async function simulateGameMove(
        gameId: number,
        team1Actions: any[],
        team2Actions: any[],
        expectedStatesCount: number = 1
    ) {
        // Commit team 1 actions
        if (team1Actions.length > 0) {
            const commitActionsTx1 = await gameContract.connect(team1Owner).commitGameActions(gameId, 1, team1Actions);
            const commitActionsReceipt1 = await commitActionsTx1.wait();
            const event1 = commitActionsReceipt1.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");
            expect(event1).to.be.not.null;
        }

        // Commit team 2 actions
        if (team2Actions.length > 0) {
            const commitActionsTx2 = await gameContract.connect(team2Owner).commitGameActions(gameId, 2, team2Actions);
            const commitActionsReceipt2 = await commitActionsTx2.wait();
            const eventGameActionCommitted2 = commitActionsReceipt2.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");
            assert(eventGameActionCommitted2, "gameActionCommitted event not found");

            // Process the actions with the game worker
            const oracleW3f: Web3FunctionHardhat = w3f.get("game-worker");
            let { result: result2 } = await oracleW3f.run("onRun", {
                userArgs: {
                    "smartContractAddress": gameContract.target,
                },
                log: eventGameActionCommitted2
            });

            expect(result2.canExec).to.be.true;

            // Execute the game worker's calldata
            for (let calldata of (result2 as any).callData) {
                const tx = await gelatoAddress.sendTransaction({ to: calldata.to, data: calldata.data });
                const receipt = await tx.wait();
            }
        }

        // Get updated game info
        const gameInfo = await gameContract.getGame(gameId);
        expect(gameInfo.team1.actions.length).to.be.equal(0);
        expect(gameInfo.team2.actions.length).to.be.equal(0);


        expect(gameInfo.history.length).to.be.equal(expectedStatesCount);

        return gameInfo;
    }

    // Reusable function to create a game and return game ID
    async function createGame() {
        await gameContract.connect(team1Owner).createTeam("Team Alpha", 1n).then((tx: any) => tx.wait());
        await gameContract.connect(team2Owner).createTeam("Team Beta", 2n).then((tx: any) => tx.wait());

        const team1Id = await gameContract.getTeamIdByWallet(team1Owner.address);
        const team2Id = await gameContract.getTeamIdByWallet(team2Owner.address);

        expect(team1Id).to.be.greaterThan(0);
        expect(team2Id).to.be.greaterThan(0);

        const tx = await gameContract.connect(team1Owner).createGameRequest(team1Id, team2Id);
        const receipt = await tx.wait();

        const event = receipt.logs.find((log: any) => log.fragment?.name === "GameRequestCreated");
        assert(event, "GameRequestCreated event not found");
        const gameRequestId = event.args[0];

        const tx2 = await gameContract.connect(team2Owner).startGame(gameRequestId);
        const receipt2 = await tx2.wait();

        const eventGameStarted = receipt2.logs.find((log: any) => log.fragment?.name === "GameStarted");
        const eventGameActionCommitted = receipt2.logs.find((log: any) => log.fragment?.name === "gameActionCommitted");

        assert(eventGameStarted, "GameStarted event not found");
        assert(eventGameActionCommitted, "gameActionCommitted event not found");

        const gameId = eventGameStarted.args[0];

        // Process initial game state
        const block = await ethers.provider.getBlock('latest')
        let overrideLog = await generateEventLog('gameActionCommitted', [gameId, block?.timestamp])

        const oracleW3f: Web3FunctionHardhat = w3f.get("game-worker");
        let { result } = await oracleW3f.run("onRun", {
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

        return gameId;
    }

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

            console.log("log", {
                blockNumber: eventGameActionCommitted.blockNumber,
                blockHash: eventGameActionCommitted.blockHash,
                transactionIndex: eventGameActionCommitted.transactionIndex,
                removed: false,
                address: eventGameActionCommitted.address,
                data: eventGameActionCommitted.data,
                topics: eventGameActionCommitted.topics,
                transactionHash: eventGameActionCommitted.transactionHash,
                logIndex: eventGameActionCommitted.logIndex
            });

            const block = await ethers.provider.getBlock('latest')
            let overrideLog = await generateEventLog('gameActionCommitted', [1, block?.timestamp])

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
            expect(gameInfo.history[0].ballOwner).to.be.equal(TeamEnum.TEAM1);
            expect(gameInfo.history[0].stateType).to.be.equal(StateType.START_POSITIONS);

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
            expect(gameInfo2.history[1].ballOwner).to.be.equal(TeamEnum.TEAM1);
            expect(gameInfo2.history[1].stateType).to.be.equal(StateType.MOVE);

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

        it('should simulate a goal and verify new start positions', async function () {
            // Create a game using the reusable function
            const gameId = await createGame();

            // First move: Team 1 moves the ball closer to the goal
            const team1Actions1 = [
                {
                    playerId: 5,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 8, y: 5 },
                    newPosition: { x: 10, y: 5 }
                }
            ];

            const team2Actions1 = [
                {
                    playerId: 3,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 5 },
                    newPosition: { x: 10, y: 6 }
                }
            ];

            // Process first move
            const gameInfo1 = await simulateGameMove(gameId, team1Actions1, team2Actions1, 2);

            // Second move: Team 1 moves the ball even closer to the goal
            const team1Actions2 = [
                {
                    playerId: 5,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 10, y: 5 },
                    newPosition: { x: 12, y: 5 }
                }
            ];

            const team2Actions2 = [
                {
                    playerId: 4,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 6 },
                    newPosition: { x: 10, y: 5 }
                }
            ];

            // Process second move
            const gameInfo2 = await simulateGameMove(gameId, team1Actions2, team2Actions2, 3);

            // Third move: Team 1 scores the goal
            const team1Actions3 = [
                {
                    playerId: 5,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 12, y: 5 },
                    newPosition: { x: 14, y: 3 } // This should be a goal for Team 2 (opponent's goal)
                }
            ];

            const team2Actions3 = [
                {
                    playerId: 3,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 5 },
                    newPosition: { x: 10, y: 6 }
                }
            ];

            // Process third move - this should result in a goal and new start positions
            // We expect 5 states total: initial + 2 moves + goal state + new start positions
            const gameInfo4 = await simulateGameMove(gameId, team1Actions3, team2Actions3, 4);

            // Third move: Team 1 scores the goal
            const team1Actions4 = [
                {
                    playerId: 5,
                    moveType: MoveType.SHOT, // PASS?SHOOT
                    oldPosition: { x: 14, y: 3 },
                    newPosition: { x: 16, y: 3 } // This should be a goal for Team 2 (opponent's goal)
                }
            ];

            const team2Actions4 = [
                {
                    playerId: 3,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 6 },
                    newPosition: { x: 10, y: 5 }
                }
            ];

            // Process third move - this should result in a goal and new start positions
            // We expect 5 states total: initial + 2 moves + goal state + new start positions
            const gameInfo5 = await simulateGameMove(gameId, team1Actions4, team2Actions4, 6);

            expect(gameInfo5.team1.score).to.be.equal(1);
            expect(gameInfo5.team2.score).to.be.equal(0);

            // Verify the goal was recorded
            const goalState = gameInfo5.history[4];
            expect(goalState.stateType).to.be.equal(StateType.GOAL_TEAM1); // GOAL_TEAM1 (since ball went to x=16, which is Team 1's goal)

            // Verify new start positions after the goal
            const newStartPositions = gameInfo5.history[5];
            expect(newStartPositions.stateType).to.be.equal(StateType.START_POSITIONS); // START_POSITIONS

            // Verify that after the goal, team 2 gets the ball (as per the game logic)
            expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM2); // TEAM2

            // Verify the ball position is at team 1's forward player
            expect(newStartPositions.ballPosition.x).to.be.equal(8);
            expect(newStartPositions.ballPosition.y).to.be.equal(5);

            // Verify team 1's forward player (player 5) is on defence start now
            expect(isPosEquals(newStartPositions.team1Positions[5], { x: 6, y: 5 })).to.be.true;

            // Verify team 2's forward player is with ball and in field center
            expect(isPosEquals(newStartPositions.team2Positions[5], { x: 8, y: 5 })).to.be.true;

            expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM2);
        });

        it('pass through the own player', async function () {
            // Create a game using the reusable function
            const gameId = await createGame();

            // First move: Team 1 moves the ball closer to the goal
            const team1Actions1 = [
                {
                    playerId: 1,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 4, y: 2 },
                    newPosition: { x: 5, y: 2 }
                },
                {
                    playerId: 5,
                    moveType: MoveType.PASS,
                    oldPosition: { x: 8, y: 5 },
                    newPosition: { x: 5, y: 2 }
                }
            ];

            const team2Actions1 = [
                {
                    playerId: 3,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 5 },
                    newPosition: { x: 10, y: 6 }
                }
            ];

            const gameInfo1 = await simulateGameMove(gameId, team1Actions1, team2Actions1, 2);

            const newStartPositions = gameInfo1.history[1];
            expect(newStartPositions.stateType).to.be.equal(StateType.MOVE);

            expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM1);

            expect(newStartPositions.ballPosition.x).to.be.equal(5);
            expect(newStartPositions.ballPosition.y).to.be.equal(2);
        });

        it('pass: opponent tackle on the fly', async function () {
            // Create a game using the reusable function
            const gameId = await createGame();

            // First move: Team 1 moves the ball closer to the goal
            const team1Actions1 = [
                {
                    playerId: 3,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 6, y: 3 },
                    newPosition: { x: 8, y: 3 }
                },
                {
                    playerId: 5,
                    moveType: MoveType.PASS,
                    oldPosition: { x: 8, y: 5 },
                    newPosition: { x: 8, y: 3 }
                }
            ];

            const team2Actions1 = [
                {
                    playerId: 5,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 5 },
                    newPosition: { x: 10, y: 4 }
                }
            ];

            const gameInfo1 = await simulateGameMove(gameId, team1Actions1, team2Actions1, 2);

            const newStartPosition1 = gameInfo1.history[1];
            expect(newStartPosition1.stateType).to.be.equal(StateType.MOVE);
            expect(newStartPosition1.ballOwner).to.be.equal(TeamEnum.TEAM1);
            expect(newStartPosition1.ballPosition.x).to.be.equal(8);
            expect(newStartPosition1.ballPosition.y).to.be.equal(3);

            const team1Actions2 = [
                {
                    playerId: 5,
                    moveType: MoveType.RUN, // RUN
                    oldPosition: { x: 8, y: 5 },
                    newPosition: { x: 10, y: 5 }
                },
                {
                    playerId: 3,
                    moveType: MoveType.PASS,
                    oldPosition: { x: 8, y: 3 },
                    newPosition: { x: 10, y: 5 }
                }
            ];

            const team2Actions2 = [
                {
                    playerId: 4,
                    moveType: MoveType.TACKLE, // TACKLE
                    oldPosition: { x: 10, y: 4 },
                    newPosition: { x: 9, y: 4 }
                }
            ];

            // Process second move
            const gameInfo2 = await simulateGameMove(gameId, team1Actions2, team2Actions2, 3);

            const newStartPosition2 = gameInfo2.history[2];
            expect(newStartPosition2.stateType).to.be.equal(StateType.MOVE);
            expect(newStartPosition2.ballOwner).to.be.equal(TeamEnum.TEAM2);
            expect(newStartPosition2.ballPosition.x).to.be.equal(9);
            expect(newStartPosition2.ballPosition.y).to.be.equal(4);
        });
    });


});

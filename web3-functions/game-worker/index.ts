import {
    Web3Function,
    Web3FunctionEventContext,
    Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, Interface } from "ethers";
import { SmartContractABI } from "./abi";
import { Game, TeamEnum, ValidationError, GameAction, isPosEquals } from '../../frontend/src/lib/game'
import { mapGameStateToContract, mapContractActionToTS, mapContractGameStateToTS, mapContractGameInfoToTS, ContractGameAction, TSGameState, TSGameInfo, CONTRACT_ENUMS, getTeamEnumNumber } from './structs'

Web3Function.onRun(async (context: Web3FunctionEventContext): Promise<Web3FunctionResult> => {
    const { multiChainProvider, userArgs } = context;
    let smartContract: Contract | null = null;
    let gameId: number = 0;

    try {
        const provider = multiChainProvider.default();
        // Contract instance for on-chain reads (cast provider to appease TS types)
        smartContract = new Contract(
            userArgs.smartContractAddress as string,
            SmartContractABI,
            provider as any
        );
        // Pure encoder for callData
        const iface = new Interface(SmartContractABI);

        const result = await processGameActions(context, smartContract, iface);
        gameId = result.gameId;

        // Prepare transaction data
        let callData: any[] = [];
        result.statesToSend.forEach((state: any) => {
            // Map the game state to the contract's expected format
            const contractGameState = mapGameStateToContract(state);

            callData.push({
                to: userArgs.smartContractAddress as string,
                data: smartContract!.interface.encodeFunctionData('newGameState', [gameId, contractGameState])
            });
        });

        if (callData.length === 0) {
            return {
                canExec: false,
                message: "No actions to process"
            };
        }

        return {
            canExec: true,
            callData: callData,
        };
    } catch (error) {
        console.error('Error in game worker:', error);

        // Check if it's a ValidationError and handle it specifically
        if (error instanceof ValidationError && smartContract) {
            // For ValidationError, we need to send a setGameError transaction
            console.log('ValidationError occurred, sending setGameError transaction');
            console.log('Team:', error.cauzedByTeam);
            console.log('Player:', error.cauzedByPlayerId);
            console.log('Message:', error.message);

            // Create setGameError transaction
            const setGameErrorCallData = {
                to: userArgs.smartContractAddress as string,
                data: smartContract.interface.encodeFunctionData('setGameError', [
                    gameId,
                    getTeamEnumNumber(error.cauzedByTeam),
                    CONTRACT_ENUMS.ERROR_TYPE.MOVE_VALIDATION_ERROR,
                    error.message
                ])
            };

            return {
                canExec: true,
                callData: [setGameErrorCallData],
            };
        }

        return {
            canExec: false,
            message: `Game worker error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
});

async function processGameActions(
    context: Web3FunctionEventContext,
    smartContract: Contract,
    iface: Interface
): Promise<{ statesToSend: TSGameState[], gameId: number }> {
    const { log, userArgs } = context;

    const event = iface.parseLog(log);
    if (!event || !event.args) {
        throw new Error("Invalid or unparsable event log");
    }

    const { gameId } = event.args as any;
    console.log('gameId', gameId);

    const contractGameInfo = await smartContract.getGame(gameId);
    const gameInfo = mapContractGameInfoToTS(contractGameInfo);
    console.log('gameInfo.status', contractGameInfo.status, gameInfo.status);
    console.log('GameInfo:', gameInfo);

    // Get team actions from the game info
    const team1Actions = gameInfo.team1?.actions || [];
    const team2Actions = gameInfo.team2?.actions || [];

    console.log('team1Actions', team1Actions);
    console.log('team2Actions', team2Actions);

    if ((team1Actions.length == 0 || team2Actions.length == 0) && gameInfo.history.length > 0) {
        throw new Error("teamActions cannot be empty");
    }

    const game = new Game(gameId);

    game.newGame(gameId, TeamEnum.TEAM1);

    for (const state of gameInfo.history) {
        game.saveState(state);
    }

    let statesToSend: TSGameState[] = [];

    // game start
    if (team1Actions.length == 0 && team2Actions.length == 0 && gameInfo.history.length == 0) {
        console.log("game start");

        statesToSend.push(game.history[0]);
        return { statesToSend, gameId };
    }

    // Convert and process team1 actions
    team1Actions.forEach((action: GameAction) => {
        // Find the player by ID in team1
        const player = game.team1.players.find(player => player.id === action.playerId);
        if (!player) {
            throw new ValidationError(
                TeamEnum.TEAM1,
                action.playerId,
                action,
                `Player ${action.playerId} not found`
            );
        }

        game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
    });
    game.commitMove(TeamEnum.TEAM1);

    // Convert and process team2 actions
    team2Actions.forEach((action: GameAction) => {
        // Find the player by ID in team2
        const player = game.team2.players.find(player => player.id === action.playerId);
        if (!player) {
            throw new ValidationError(
                TeamEnum.TEAM2,
                action.playerId,
                action,
                `Player ${action.playerId} not found`
            );
        }

        game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
    });

    game.commitMove(TeamEnum.TEAM2);

    const { newState, rendererStates } = game.calculateNewState();

    rendererStates.forEach((state: any) => {
        if (state.type === "goal") {
            statesToSend.push(state);
        }
    });
    statesToSend.push(newState);

    return { statesToSend, gameId };
}
import {
    Web3Function,
    Web3FunctionEventContext,
    Web3FunctionResult,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, Interface } from "ethers";
import { SmartContractABI } from "./abi";
import { Game, TeamEnum } from '../../src/lib/game/game'


Web3Function.onRun(async (context: Web3FunctionEventContext): Promise<Web3FunctionResult> => {
    const { log, userArgs, multiChainProvider } = context;

    const provider = multiChainProvider.default();
    // Contract instance for on-chain reads (cast provider to appease TS types)
    const smartContract = new Contract(
        userArgs.smartContractAddress as string,
        SmartContractABI,
        provider as any
    );
    // Pure encoder for callData
    const iface = new Interface(SmartContractABI);

    const event = iface.parseLog(log);
    if (!event || !event.args) {
        return { canExec: false, message: "Invalid or unparsable event log" };
    }

    const { gameId, time, team1Actions, team2Actions } = event.args as any;

    const gameInfo = await smartContract.getGame(gameId);
    console.log(gameInfo);

    const game = new Game(gameId);
    game.newGame(gameId, TeamEnum.TEAM1);

    gameInfo.history.forEach(state => {
        game.saveState(state);
    });

    team1Actions.forEach(action => {
        game.commitMove(TeamEnum.TEAM1, action);
    });

    team2Actions.forEach(action => {
        game.commitMove(TeamEnum.TEAM2, action);
    });

    const { newState, rendererStates } = game.calculateNewState();


    let statesToSend = [];
    rendererStates.forEach(state => {
        if (state.stateType == StateType.GOAL_TEAM1 || state.stateType == StateType.GOAL_TEAM2) {
            statesToSend.push(state);
        }
    });
    statesToSend.push(newState);

    let callData = [];
    statesToSend.forEach(state => {
        callData.push(smartContract.interface.encodeFunctionData('newGameState', [gameId, state, ""]));
    });

    return {
        canExec: true,
        callData: callData,
    };
});
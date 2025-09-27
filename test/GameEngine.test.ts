import { expect } from "chai";
import { Game, isPosEquals, GameStateType, TeamEnum, MoveType } from "../frontend/lib/game";

describe("Game Engine", function () {
    it("should create a game and fill start positions", async function () {
        const game = new Game(1);
        game.newGame(1, TeamEnum.TEAM1);

        expect(game.history.length).to.be.greaterThan(0);
        expect(game.history[0].team1PlayerPositions.length).to.be.equal(6);
        expect(game.history[0].team2PlayerPositions.length).to.be.equal(6);
        expect(game.history[0].ballPosition.x).to.be.equal(8);
        expect(game.history[0].ballPosition.y).to.be.equal(5);
        expect(game.history[0].ballOwner).to.be.equal(TeamEnum.TEAM1);
        expect(game.history[0].type).to.be.equal(GameStateType.START_POSITIONS);

        expect(isPosEquals(game.history[0].team1PlayerPositions[0], { x: 1, y: 5 })).to.be.true;
        expect(isPosEquals(game.history[0].team1PlayerPositions[1], { x: 4, y: 2 })).to.be.true;
        expect(isPosEquals(game.history[0].team1PlayerPositions[2], { x: 4, y: 8 })).to.be.true;
        expect(isPosEquals(game.history[0].team1PlayerPositions[3], { x: 6, y: 3 })).to.be.true;
        expect(isPosEquals(game.history[0].team1PlayerPositions[4], { x: 6, y: 7 })).to.be.true;
        expect(isPosEquals(game.history[0].team1PlayerPositions[5], { x: 8, y: 5 })).to.be.true;

        expect(isPosEquals(game.history[0].team2PlayerPositions[0], { x: 15, y: 5 })).to.be.true;
        expect(isPosEquals(game.history[0].team2PlayerPositions[1], { x: 12, y: 2 })).to.be.true;
        expect(isPosEquals(game.history[0].team2PlayerPositions[2], { x: 12, y: 8 })).to.be.true;
        expect(isPosEquals(game.history[0].team2PlayerPositions[3], { x: 10, y: 2 })).to.be.true;
        expect(isPosEquals(game.history[0].team2PlayerPositions[4], { x: 10, y: 8 })).to.be.true;
        expect(isPosEquals(game.history[0].team2PlayerPositions[5], { x: 10, y: 5 })).to.be.true;
    });

    it("should commit moves and calculate new state", async function () {
        const game = new Game(1);
        game.newGame(1, TeamEnum.TEAM1);
        game.doPlayerMove(game.team1.players[5], MoveType.PASS, { x: 8, y: 5 }, { x: 8, y: 3 }, false);
        game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 8, y: 3 }, false);
        game.commitMove(TeamEnum.TEAM1);

        game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
        game.doPlayerMove(game.team2.players[4], MoveType.TACKLE, { x: 10, y: 8 }, { x: 10, y: 7 }, false);
        game.commitMove(TeamEnum.TEAM2);

        const { newState, rendererStates } = game.calculateNewState();

        expect(game.history.length).to.be.equal(2);
        expect(game.history[1].team1PlayerPositions.length).to.be.equal(6);
        expect(game.history[1].team2PlayerPositions.length).to.be.equal(6);
        expect(game.history[1].ballPosition.x).to.be.equal(8);
        expect(game.history[1].ballPosition.y).to.be.equal(3);
        expect(game.history[1].ballOwner).to.be.equal(TeamEnum.TEAM1);
        expect(game.history[1].type).to.be.equal(GameStateType.MOVE);

        expect(isPosEquals(game.history[1].team1PlayerPositions[0], { x: 1, y: 5 })).to.be.true;
        expect(isPosEquals(game.history[1].team1PlayerPositions[1], { x: 4, y: 2 })).to.be.true;
        expect(isPosEquals(game.history[1].team1PlayerPositions[2], { x: 4, y: 8 })).to.be.true;
        expect(isPosEquals(game.history[1].team1PlayerPositions[3], { x: 8, y: 3 })).to.be.true;
        expect(isPosEquals(game.history[1].team1PlayerPositions[4], { x: 6, y: 7 })).to.be.true;
        expect(isPosEquals(game.history[1].team1PlayerPositions[5], { x: 8, y: 5 })).to.be.true;

        expect(isPosEquals(game.history[1].team2PlayerPositions[0], { x: 15, y: 5 })).to.be.true;
        expect(isPosEquals(game.history[1].team2PlayerPositions[1], { x: 12, y: 2 })).to.be.true;
        expect(isPosEquals(game.history[1].team2PlayerPositions[2], { x: 12, y: 8 })).to.be.true;
        expect(isPosEquals(game.history[1].team2PlayerPositions[3], { x: 10, y: 3 })).to.be.true;
        expect(isPosEquals(game.history[1].team2PlayerPositions[4], { x: 10, y: 7 })).to.be.true;
        expect(isPosEquals(game.history[1].team2PlayerPositions[5], { x: 10, y: 5 })).to.be.true;
    });

    it("should simulate a goal and verify new start positions", async function () {
        const game = new Game(1);
        game.newGame(1, TeamEnum.TEAM1);

        // First move: Team 1 moves the ball closer to the goal
        game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 8, y: 5 }, { x: 10, y: 5 }, false);
        game.commitMove(TeamEnum.TEAM1);

        game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 5 }, { x: 10, y: 6 }, false);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state1, rendererStates: rendererStates1 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(2);

        // Second move: Team 1 moves the ball even closer to the goal
        game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 10, y: 5 }, { x: 12, y: 5 }, false);
        game.commitMove(TeamEnum.TEAM1);

        game.doPlayerMove(game.team2.players[4], MoveType.TACKLE, { x: 10, y: 6 }, { x: 10, y: 5 }, false);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state2, rendererStates: rendererStates2 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(3);

        // Third move: Team 1 moves the ball to goal area
        game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 12, y: 5 }, { x: 14, y: 3 }, false);
        game.commitMove(TeamEnum.TEAM1);

        game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 5 }, { x: 10, y: 6 }, false);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state3, rendererStates: rendererStates3 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(4);

        // Fourth move: Team 1 scores the goal by moving the ball directly to the goal
        // The ball should be with Team 1 player 5 at position (14, 3)
        game.doPlayerMove(game.team1.players[5], MoveType.SHOT, { x: 14, y: 3 }, { x: 16, y: 3 }, false);
        game.commitMove(TeamEnum.TEAM1);

        game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 6 }, { x: 10, y: 5 }, false);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state4, rendererStates: rendererStates4 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(6);

        expect(game.team1.score).to.be.equal(1);
        expect(game.team2.score).to.be.equal(0);

        // Verify the goal was recorded
        const goalState = game.history[4];
        expect(goalState.type).to.be.equal(GameStateType.GOAL_TEAM1);

        // Verify new start positions after the goal
        const newStartPositions = game.history[5];
        expect(newStartPositions.type).to.be.equal(GameStateType.START_POSITIONS);

        // Verify that after the goal, team 2 gets the ball (as per the game logic)
        expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM2);

        // Verify the ball position is at team 1's forward player
        expect(newStartPositions.ballPosition.x).to.be.equal(8);
        expect(newStartPositions.ballPosition.y).to.be.equal(5);

        // Verify team 1's forward player (player 5) is on defence start now
        expect(isPosEquals(newStartPositions.team1PlayerPositions[5], { x: 6, y: 5 })).to.be.true;

        // Verify team 2's forward player is with ball and in field center
        expect(isPosEquals(newStartPositions.team2PlayerPositions[5], { x: 8, y: 5 })).to.be.true;

        expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM2);
    });

    it("pass through the own player", async function () {
        const game = new Game(1);
        game.newGame(1, TeamEnum.TEAM1);

        // Team 1 moves a player and passes the ball to them
        game.doPlayerMove(game.team1.players[1], MoveType.RUN, { x: 4, y: 2 }, { x: 5, y: 2 }, false);
        game.doPlayerMove(game.team1.players[5], MoveType.PASS, { x: 8, y: 5 }, { x: 5, y: 2 }, false);
        game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 5 }, { x: 10, y: 6 }, false);
        game.commitMove(TeamEnum.TEAM1);
        game.commitMove(TeamEnum.TEAM2);

        const { newState, rendererStates } = game.calculateNewState();
        expect(game.history.length).to.be.equal(2);

        const newStartPositions = game.history[1];
        expect(newStartPositions.type).to.be.equal(GameStateType.MOVE);
        expect(newStartPositions.ballOwner).to.be.equal(TeamEnum.TEAM1);
        expect(newStartPositions.ballPosition.x).to.be.equal(5);
        expect(newStartPositions.ballPosition.y).to.be.equal(2);
    });

    it("pass: opponent tackle on the fly", async function () {
        const game = new Game(1);
        game.newGame(1, TeamEnum.TEAM1);

        // First move: Team 1 moves a player and passes the ball to them
        game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 8, y: 3 }, false);
        game.doPlayerMove(game.team1.players[5], MoveType.PASS, { x: 8, y: 5 }, { x: 8, y: 3 }, false);
        game.doPlayerMove(game.team2.players[5], MoveType.TACKLE, { x: 10, y: 5 }, { x: 10, y: 4 }, false);
        game.commitMove(TeamEnum.TEAM1);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state1, rendererStates: rendererStates1 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(2);

        const newStartPosition1 = game.history[1];
        expect(newStartPosition1.type).to.be.equal(GameStateType.MOVE);
        expect(newStartPosition1.ballOwner).to.be.equal(TeamEnum.TEAM1);
        expect(newStartPosition1.ballPosition.x).to.be.equal(8);
        expect(newStartPosition1.ballPosition.y).to.be.equal(3);

        // Second move: Team 1 moves the ball and passes, but Team 2 tackles
        game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 8, y: 5 }, { x: 10, y: 5 }, false);
        game.doPlayerMove(game.team1.players[3], MoveType.PASS, { x: 8, y: 3 }, { x: 10, y: 5 }, false);
        game.doPlayerMove(game.team2.players[4], MoveType.TACKLE, { x: 10, y: 4 }, { x: 9, y: 4 }, false);
        game.commitMove(TeamEnum.TEAM1);
        game.commitMove(TeamEnum.TEAM2);

        const { newState: state2, rendererStates: rendererStates2 } = game.calculateNewState();
        expect(game.history.length).to.be.equal(3);

        const newStartPosition2 = game.history[2];
        expect(newStartPosition2.type).to.be.equal(GameStateType.MOVE);
        expect(newStartPosition2.ballOwner).to.be.equal(TeamEnum.TEAM2);
        expect(newStartPosition2.ballPosition.x).to.be.equal(9);
        expect(newStartPosition2.ballPosition.y).to.be.equal(4);
    });
});
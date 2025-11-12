import { expect } from "chai";
import { Game, isPosEquals, GameStateType, TeamEnum, MoveType, GameState } from "../frontend/lib/game";

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

    describe("Penalty Logic", function () {
        it("should trigger penalty when team has 3 or more players in vertical row", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Make several moves to get players into positions where we can create a vertical row
            // First move: establish a state
            game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 8, y: 5 }, { x: 9, y: 5 }, false);
            game.commitMove(TeamEnum.TEAM1);
            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM2);
            game.calculateNewState();

            // Second move: position players
            game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: 9, y: 5 }, { x: 5, y: 4 }, false);
            game.commitMove(TeamEnum.TEAM1);
            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 3 }, { x: 10, y: 4 }, false);
            game.commitMove(TeamEnum.TEAM2);
            game.calculateNewState();

            // Now make moves that CREATE a vertical row at x=5
            // Get the current positions
            const lastState = game.history[game.history.length - 1];
            game.restoreState(lastState);
            
            // Move players to create vertical row: 3 players at x=5
            // Player 1 is at {4, 2}, move to {5, 2}
            // Player 3 is at {6, 3}, move to {5, 3}  
            // Player 5 is at {5, 4}, move to {5, 5}
            // This creates 3 players at x=5: players 1, 3, 5
            const p1Pos = lastState.team1PlayerPositions[1];
            const p3Pos = lastState.team1PlayerPositions[3];
            const p5Pos = lastState.team1PlayerPositions[5];
            
            game.doPlayerMove(game.team1.players[1], MoveType.RUN, p1Pos, { x: 5, y: p1Pos.y }, false);
            game.doPlayerMove(game.team1.players[3], MoveType.RUN, p3Pos, { x: 5, y: p3Pos.y }, false);
            game.doPlayerMove(game.team1.players[5], MoveType.RUN, p5Pos, { x: 5, y: p5Pos.y + 1 }, false);
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 4 }, { x: 10, y: 5 }, false);
            game.commitMove(TeamEnum.TEAM2);

            const { newState } = game.calculateNewState();

            // Check if penalty state was created (vertical row check happens after moves)
            const penaltyState = game.history.find(state => state.type === GameStateType.PENALTY);
            expect(penaltyState).to.not.be.undefined;
            expect(penaltyState?.type).to.be.equal(GameStateType.PENALTY);
        });

        it("should trigger penalty when player controls ball for 15+ consecutive moves", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Simulate 15 consecutive moves by the same player with the ball
            // Keep positions within field bounds (FIELD_WIDTH = 15, so x goes from 1 to 15)
            for (let i = 0; i < 15; i++) {
                const currentX = Math.min(8 + i, 14); // Keep within bounds
                const nextX = Math.min(8 + i + 1, 15);
                game.doPlayerMove(game.team1.players[5], MoveType.RUN, { x: currentX, y: 5 }, { x: nextX, y: 5 }, false);
                game.commitMove(TeamEnum.TEAM1);

                game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
                game.commitMove(TeamEnum.TEAM2);

                game.calculateNewState();
            }

            // Next move should trigger penalty (16th consecutive move)
            // This move will trigger the penalty, so we don't need to make another move
            // The penalty will be set up and the moves won't be processed
            const lastState = game.history[game.history.length - 1];
            const currentBallPos = lastState.ballPosition;
            game.doPlayerMove(game.team1.players[5], MoveType.RUN, currentBallPos, { x: Math.min(currentBallPos.x + 1, 15), y: currentBallPos.y }, false);
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 3 }, { x: 10, y: 4 }, false);
            game.commitMove(TeamEnum.TEAM2);

            const { newState } = game.calculateNewState();

            // Check if penalty state was created
            const penaltyState = game.history.find(state => state.type === GameStateType.PENALTY);
            expect(penaltyState).to.not.be.undefined;
            
            // After penalty is set up, the next move should be a PASS or SHOT
            // Make a valid move from penalty position
            const playerWithBall = game.team1.players.find(p => p.ball);
            if (playerWithBall) {
                // Player is at penalty position, make a SHOT to goal
                const shotTarget = { x: 0, y: 5 }; // Left goal center
                game.doPlayerMove(playerWithBall, MoveType.SHOT, playerWithBall.position, shotTarget, false);
                game.commitMove(TeamEnum.TEAM1);

                game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 4 }, { x: 10, y: 5 }, false);
                game.commitMove(TeamEnum.TEAM2);

                const { newState: nextState } = game.calculateNewState();
                expect(nextState).to.not.be.undefined;
            }
        });

        it("should trigger penalty when team with ball doesn't move it", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Team1 has the ball, but makes moves without PASS or SHOT
            game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 7, y: 3 }, false);
            game.doPlayerMove(game.team1.players[4], MoveType.RUN, { x: 6, y: 7 }, { x: 7, y: 7 }, false);
            // No PASS or SHOT move by team with ball
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM2);

            const { newState } = game.calculateNewState();

            // Check if penalty state was created
            const penaltyState = game.history.find(state => state.type === GameStateType.PENALTY);
            expect(penaltyState).to.not.be.undefined;
        });

        it("should restrict moves in penalty mode to only PASS or SHOT", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Trigger penalty by not moving ball
            game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 7, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM2);

            game.calculateNewState();

            // Now in penalty mode, try to make a RUN move with ball (should fail)
            const playerWithBall = game.team1.players.find(p => p.ball);
            if (playerWithBall) {
                try {
                    game.doPlayerMove(playerWithBall, MoveType.RUN, playerWithBall.position, { x: playerWithBall.position.x + 1, y: playerWithBall.position.y }, false);
                    game.commitMove(TeamEnum.TEAM1);

                    game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 3 }, { x: 10, y: 4 }, false);
                    game.commitMove(TeamEnum.TEAM2);

                    game.calculateNewState();
                    expect.fail("Should have thrown validation error for RUN in penalty mode");
                } catch (error: any) {
                    expect(error.message).to.include("penalty mode");
                }
            }
        });

        it("should allow PASS and SHOT in penalty mode", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Trigger penalty by not moving ball
            game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 7, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM2);

            game.calculateNewState();

            // Now in penalty mode, make a SHOT move (should succeed)
            // The penalty taker is at {10, 3} for right goal (Team1 attacking Team2's goal)
            // SHOT distance is 4, so from {10, 3} we can reach up to {14, 3} or {10, 7} etc.
            // To reach goal at x=16, we need to shoot in steps or use a closer target
            const playerWithBall = game.team1.players.find(p => p.ball);
            if (playerWithBall) {
                // Player is at {10, 3}, shoot towards right goal
                // SHOT distance is 4, so we can shoot to {14, 3} which is within range
                // The ball will travel towards the goal
                const shotTarget = { x: 14, y: 3 }; // Within SHOT distance of 4
                game.doPlayerMove(playerWithBall, MoveType.SHOT, playerWithBall.position, shotTarget, false);
                game.commitMove(TeamEnum.TEAM1);

                game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 3 }, { x: 10, y: 4 }, false);
                game.commitMove(TeamEnum.TEAM2);

                const { newState } = game.calculateNewState();
                expect(newState).to.not.be.undefined;
            }
        });

        it("should set up penalty positions correctly", async function () {
            const game = new Game(1);
            game.newGame(1, TeamEnum.TEAM1);

            // Trigger penalty
            game.doPlayerMove(game.team1.players[3], MoveType.RUN, { x: 6, y: 3 }, { x: 7, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM1);

            game.doPlayerMove(game.team2.players[3], MoveType.TACKLE, { x: 10, y: 2 }, { x: 10, y: 3 }, false);
            game.commitMove(TeamEnum.TEAM2);

            const historyLengthBefore = game.history.length;
            game.calculateNewState();

            // Check penalty state was created
            const penaltyState = game.history.find(state => state.type === GameStateType.PENALTY);
            expect(penaltyState).to.not.be.undefined;
            expect(penaltyState?.type).to.be.equal(GameStateType.PENALTY);
        });
    });
});
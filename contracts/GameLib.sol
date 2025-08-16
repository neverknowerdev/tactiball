// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./EloCalculationLib.sol";

library GameLib {
    // Constants
    uint256 public constant MAX_MOVES = 45;
    uint256 public constant MAX_MOVE_TIME = 1 minutes;

    // Enums
    enum TeamFormation {
        FORMATION_2_2_1
    }

    enum TeamEnum {
        NONE,
        TEAM1,
        TEAM2
    }

    enum MoveType {
        PASS,
        TACKLE,
        RUN,
        SHOT
    }

    enum GameStatus {
        NONE,
        ACTIVE,
        FINISHED,
        FINISHED_BY_TIMEOUT
    }

    enum FinishReason {
        MAX_MOVES_REACHED,
        MOVE_TIMEOUT
    }

    // Structs
    struct Position {
        uint8 x;
        uint8 y;
    }

    struct GameAction {
        uint256 playerId;
        MoveType moveType;
        Position oldPosition;
        Position newPosition;
    }

    enum StateType {
        START_POSITIONS,
        MOVE,
        GOAL_TEAM1,
        GOAL_TEAM2
    }

    struct GameState {
        Position[] team1Positions;
        Position[] team2Positions;
        Position ballPosition;
        TeamEnum ballOwner;
        uint8[] clashRandomResults;
        StateType stateType;
    }

    struct GameStatistics {
        uint32 wins;
        uint32 losses;
        uint32 draws;
        uint32 totalGames;
        uint32 totalGoalsScored;
        uint32 totalGoalsConceded;
        // biggestWin
        uint32 biggestWinGoalsScored;
        uint32 biggestWinGoalsConceded;
        // biggestLoss
        uint32 biggestLossGoalsScored;
        uint32 biggestLossGoalsConceded;
    }

    struct Team {
        uint256 id;
        address wallet;
        string name;
        uint64 eloRating;
        uint256 registeredAt;
        uint256[] games;
        uint8 country;
        bool hasActiveGame;
        uint256 gameRequestId;
        GameStatistics statistic;
    }

    struct TeamInfo {
        uint256 teamId;
        uint8 score;
        uint64 eloRating;
        uint64 eloRatingNew;
        TeamFormation formation;
        //
        GameAction[] actions;
    }

    struct Game {
        uint256 gameId;
        //
        uint256 createdAt;
        //
        uint256 lastMoveAt;
        TeamEnum lastMoveTeam;
        //
        TeamInfo team1;
        TeamInfo team2;
        //
        GameState[] history;
        GameStatus status;
        //
        uint8 movesMade;
        //
        TeamEnum winner;
    }

    struct GameRequest {
        uint256 gameRequestId;
        uint256 team1id;
        uint256 team2id;
        uint256 createdAt;
    }

    // Helper function to trim leading and trailing spaces from a string
    function trimSpaces(
        string memory str
    ) external pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        uint256 start = 0;
        uint256 end = strBytes.length;

        // Find the first non-space character
        while (start < end && strBytes[start] == 0x20) {
            start++;
        }

        // Find the last non-space character
        while (end > start && strBytes[end - 1] == 0x20) {
            end--;
        }

        // If the string is all spaces, return empty string
        if (start >= end) {
            return "";
        }

        // Create a new string with the trimmed content
        bytes memory result = new bytes(end - start);
        for (uint256 i = 0; i < result.length; i++) {
            result[i] = strBytes[start + i];
        }

        return string(result);
    }

    // Team Management Functions
    function createTeam(
        uint256 nextTeamId,
        address wallet,
        string memory name,
        uint8 countryID,
        uint256 createdAt
    ) external pure returns (Team memory) {
        // Trim leading and trailing spaces from the team name

        return
            Team({
                id: nextTeamId,
                wallet: wallet,
                name: name,
                eloRating: EloCalculationLib.getDefaultRating(),
                registeredAt: createdAt,
                games: new uint256[](0),
                country: countryID,
                hasActiveGame: false,
                gameRequestId: 0,
                statistic: GameStatistics({
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    totalGames: 0,
                    totalGoalsScored: 0,
                    totalGoalsConceded: 0,
                    biggestWinGoalsScored: 0,
                    biggestWinGoalsConceded: 0,
                    biggestLossGoalsScored: 0,
                    biggestLossGoalsConceded: 0
                })
            });
    }
    // Game Management Functions
    function createGame(
        uint256 team1id,
        uint256 team2id,
        uint256 nextGameId,
        uint64 team1EloRating,
        uint64 team2EloRating
    ) internal view returns (Game memory) {
        TeamInfo memory team1Info = TeamInfo({
            teamId: team1id,
            score: 0,
            eloRating: team1EloRating,
            eloRatingNew: 0,
            formation: TeamFormation.FORMATION_2_2_1,
            actions: new GameAction[](0)
        });

        TeamInfo memory team2Info = TeamInfo({
            teamId: team2id,
            score: 0,
            eloRating: team2EloRating,
            eloRatingNew: 0,
            formation: TeamFormation.FORMATION_2_2_1,
            actions: new GameAction[](0)
        });

        return
            Game({
                gameId: nextGameId,
                createdAt: block.timestamp,
                lastMoveAt: 0,
                lastMoveTeam: TeamEnum.NONE,
                team1: team1Info,
                team2: team2Info,
                history: new GameState[](0),
                status: GameStatus.ACTIVE,
                movesMade: 0,
                winner: TeamEnum.NONE
            });
    }

    function createGameRequest(
        uint256 gameRequestId,
        uint256 team1id,
        uint256 team2id
    ) internal view returns (GameRequest memory) {
        return
            GameRequest({
                gameRequestId: gameRequestId,
                team1id: team1id,
                team2id: team2id,
                createdAt: block.timestamp
            });
    }

    function cancelGameRequest(
        mapping(uint256 => GameRequest) storage gameRequests,
        mapping(uint256 => Team) storage teams,
        uint256 gameRequestId
    ) external {
        require(gameRequestId > 0, "Game request does not exist");

        GameRequest storage request = gameRequests[gameRequestId];
        require(request.createdAt > 0, "Game request does not exist");

        Team storage team = teams[request.team1id];

        team.gameRequestId = 0;
        delete gameRequests[request.gameRequestId];
    }

    // Helper functions to access team data
    function getTeamInfo(
        Game storage game,
        TeamEnum team
    ) internal view returns (TeamInfo storage) {
        if (team == TeamEnum.TEAM1) {
            return game.team1;
        } else {
            return game.team2;
        }
    }

    function getTeamScore(
        Game storage game,
        TeamEnum team
    ) internal view returns (uint8) {
        return getTeamInfo(game, team).score;
    }

    function setTeamScore(
        Game storage game,
        TeamEnum team,
        uint8 score
    ) internal {
        getTeamInfo(game, team).score = score;
    }

    function getTeamEloRating(
        Game storage game,
        TeamEnum team
    ) internal view returns (uint64) {
        return getTeamInfo(game, team).eloRating;
    }

    function setTeamEloRating(
        Game storage game,
        TeamEnum team,
        uint64 eloRating
    ) internal {
        getTeamInfo(game, team).eloRating = eloRating;
    }

    function getTeamEloRatingNew(
        Game storage game,
        TeamEnum team
    ) internal view returns (uint64) {
        return getTeamInfo(game, team).eloRatingNew;
    }

    function setTeamEloRatingNew(
        Game storage game,
        TeamEnum team,
        uint64 eloRating
    ) internal {
        getTeamInfo(game, team).eloRatingNew = eloRating;
    }

    function getTeamActions(
        Game storage game,
        TeamEnum team
    ) internal view returns (GameAction[] storage) {
        return getTeamInfo(game, team).actions;
    }

    function setTeamActions(
        Game storage game,
        TeamEnum team,
        GameAction[] calldata actions
    ) internal {
        getTeamInfo(game, team).actions = actions;
    }

    function clearTeamActions(Game storage game, TeamEnum team) internal {
        delete getTeamInfo(game, team).actions;
    }

    function commitGameActions(
        Game storage game,
        TeamEnum team,
        GameAction[] calldata actions
    ) external returns (bool) {
        TeamInfo storage teamInfo = getTeamInfo(game, team);

        require(
            teamInfo.actions.length == 0,
            team == TeamEnum.TEAM1
                ? "Team 1 already has actions"
                : "Team 2 already has actions"
        );

        setTeamActions(game, team, actions);
        game.lastMoveTeam = team;
        game.lastMoveAt = block.timestamp;

        return
            getTeamActions(game, TeamEnum.TEAM1).length > 0 &&
            getTeamActions(game, TeamEnum.TEAM2).length > 0;
    }

    function finishGame(
        Game storage game,
        Team storage team1,
        Team storage team2,
        FinishReason finishReason
    ) internal returns (TeamEnum winner) {
        require(game.status == GameStatus.ACTIVE, "Game is not active");

        game.status = GameStatus.FINISHED;

        team1.statistic.totalGames++;
        team2.statistic.totalGames++;

        team1.hasActiveGame = false;
        team2.hasActiveGame = false;

        if (finishReason == FinishReason.MOVE_TIMEOUT) {
            winner = game.lastMoveTeam;

            if (winner == TeamEnum.TEAM1) {
                setTeamScore(game, TeamEnum.TEAM1, 3);
                setTeamScore(game, TeamEnum.TEAM2, 0);
            } else {
                setTeamScore(game, TeamEnum.TEAM1, 0);
                setTeamScore(game, TeamEnum.TEAM2, 3);
            }
            // that's technical win, don't update team stat
            // Event will be emitted from the main contract
            return winner;
        }
        if (finishReason == FinishReason.MAX_MOVES_REACHED) {
            if (
                getTeamScore(game, TeamEnum.TEAM1) >
                getTeamScore(game, TeamEnum.TEAM2)
            ) {
                winner = TeamEnum.TEAM1;
            } else if (
                getTeamScore(game, TeamEnum.TEAM1) <
                getTeamScore(game, TeamEnum.TEAM2)
            ) {
                winner = TeamEnum.TEAM2;
            } else {
                winner = TeamEnum.NONE;
            }
            // Event will be emitted from the main contract
        }

        game.winner = winner;

        _updateTeamStatistics(game, team1, team2);
        return winner;
    }

    function newGameState(
        Game storage game,
        GameState calldata gameState
    ) external {
        game.history.push(gameState);

        game.movesMade++;
        game.lastMoveAt = block.timestamp;

        clearTeamActions(game, TeamEnum.TEAM1);
        clearTeamActions(game, TeamEnum.TEAM2);
        game.lastMoveTeam = TeamEnum.NONE;

        if (gameState.stateType == StateType.GOAL_TEAM1) {
            uint8 currentScore = getTeamScore(game, TeamEnum.TEAM1);
            setTeamScore(game, TeamEnum.TEAM1, currentScore + 1);
        } else if (gameState.stateType == StateType.GOAL_TEAM2) {
            uint8 currentScore = getTeamScore(game, TeamEnum.TEAM2);
            setTeamScore(game, TeamEnum.TEAM2, currentScore + 1);
        }
    }

    function _updateTeamStatistics(
        Game storage game,
        Team storage team1,
        Team storage team2
    ) private {
        team1.statistic.totalGoalsScored += getTeamScore(game, TeamEnum.TEAM1);
        team1.statistic.totalGoalsConceded += getTeamScore(
            game,
            TeamEnum.TEAM2
        );
        team2.statistic.totalGoalsScored += getTeamScore(game, TeamEnum.TEAM2);
        team2.statistic.totalGoalsConceded += getTeamScore(
            game,
            TeamEnum.TEAM1
        );

        if (
            getTeamScore(game, TeamEnum.TEAM1) >
            getTeamScore(game, TeamEnum.TEAM2)
        ) {
            team1.statistic.wins++;
            team2.statistic.losses++;

            if (
                getTeamScore(game, TeamEnum.TEAM1) -
                    getTeamScore(game, TeamEnum.TEAM2) >
                team1.statistic.biggestWinGoalsScored -
                    team1.statistic.biggestWinGoalsConceded
            ) {
                team1.statistic.biggestWinGoalsScored = getTeamScore(
                    game,
                    TeamEnum.TEAM1
                );
                team1.statistic.biggestWinGoalsConceded = getTeamScore(
                    game,
                    TeamEnum.TEAM2
                );
            }

            if (
                getTeamScore(game, TeamEnum.TEAM1) -
                    getTeamScore(game, TeamEnum.TEAM2) >
                team2.statistic.biggestLossGoalsConceded -
                    team2.statistic.biggestLossGoalsScored
            ) {
                team2.statistic.biggestLossGoalsScored = getTeamScore(
                    game,
                    TeamEnum.TEAM2
                );
                team2.statistic.biggestLossGoalsConceded = getTeamScore(
                    game,
                    TeamEnum.TEAM1
                );
            }
        } else if (
            getTeamScore(game, TeamEnum.TEAM1) <
            getTeamScore(game, TeamEnum.TEAM2)
        ) {
            team1.statistic.losses++;
            team2.statistic.wins++;

            if (
                getTeamScore(game, TeamEnum.TEAM2) -
                    getTeamScore(game, TeamEnum.TEAM1) >
                team2.statistic.biggestWinGoalsScored -
                    team2.statistic.biggestWinGoalsConceded
            ) {
                team2.statistic.biggestWinGoalsScored = getTeamScore(
                    game,
                    TeamEnum.TEAM2
                );
                team2.statistic.biggestWinGoalsConceded = getTeamScore(
                    game,
                    TeamEnum.TEAM1
                );
            }

            if (
                getTeamScore(game, TeamEnum.TEAM2) -
                    getTeamScore(game, TeamEnum.TEAM1) >
                team1.statistic.biggestLossGoalsConceded -
                    team1.statistic.biggestLossGoalsScored
            ) {
                team1.statistic.biggestLossGoalsScored = getTeamScore(
                    game,
                    TeamEnum.TEAM1
                );
                team1.statistic.biggestLossGoalsConceded = getTeamScore(
                    game,
                    TeamEnum.TEAM2
                );
            }
        } else {
            team1.statistic.draws++;
            team2.statistic.draws++;
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./GameLib.sol";
import "./EloCalculationLib.sol";

contract ChessBallGame {
    using GameLib for *;

    // Events
    event GameStarted(uint256 indexed gameId, GameLib.Team teamWithBall);

    event GoalScored(uint256 indexed gameId, GameLib.TeamEnum scoringTeam);
    event GameFinished(
        uint256 indexed gameId,
        GameLib.TeamEnum winner,
        GameLib.FinishReason finishReason
    );
    event gameActionCommitted(
        uint256 indexed gameId,
        uint256 time,
        GameLib.GameAction[] team1Actions,
        GameLib.GameAction[] team2Actions
    );
    event NewGameState(
        uint256 indexed gameId,
        uint256 time,
        GameLib.GameState newGameState
    );
    event GameStateError(uint256 indexed gameId, uint256 time, string errorMsg);

    // State variables
    mapping(uint256 => GameLib.Game) public games;
    mapping(uint256 => GameLib.Team) public teams;
    mapping(address => uint256) public teamIdByWallet;

    uint256 public nextGameId;
    uint256 public nextTeamId;

    uint64 public activeGameCount;

    // Gelato address for automation
    address public gelatoAddress;

    // Game request mappings
    mapping(uint256 => GameLib.GameRequest) public gameRequests;
    uint256 public gameRequestIndex;

    /**
     * @dev Constructor to set the Gelato address
     * @param _gelatoAddress The address of the Gelato automation service
     */
    constructor(address _gelatoAddress) {
        require(_gelatoAddress != address(0), "Gelato address cannot be zero");
        gelatoAddress = _gelatoAddress;
    }

    function createTeam(
        address wallet,
        string memory name,
        uint8 country
    ) public {
        require(teamIdByWallet[wallet] == 0, "Team already exists");
        require(bytes(name).length > 0, "Name is required");
        require(country > 0, "Country is required");

        nextTeamId++;
        GameLib.Team memory team = GameLib.createTeam(
            nextTeamId,
            wallet,
            name,
            country,
            block.timestamp
        );

        teams[team.id] = team;
        teamIdByWallet[wallet] = team.id;
    }

    function createGameRequest(
        uint256 team1id,
        uint256 team2id
    ) public returns (uint256) {
        require(teams[team1id].id > 0, "Team 1 does not exist");
        require(teams[team2id].id > 0, "Team 2 does not exist");
        require(
            teams[team1id].id != teams[team2id].id,
            "Teams cannot be the same"
        );
        require(
            teams[team1id].wallet == msg.sender,
            "Team1 owner should call createGameRequest"
        );

        require(
            !teams[team2id].hasActiveGame,
            "Team2 already has an active game"
        );

        if (teams[team1id].gameRequestId > 0) {
            cancelGameRequest(teams[team1id].gameRequestId);
        }

        gameRequestIndex++;
        GameLib.GameRequest memory request = GameLib.createGameRequest(
            gameRequestIndex,
            team1id,
            team2id
        );

        gameRequests[request.gameRequestId] = request;
        teams[team1id].gameRequestId = request.gameRequestId;

        return request.gameRequestId;
    }

    function cancelGameRequest(uint256 gameRequestId) public {
        require(gameRequestId > 0, "Game request does not exist");
        require(
            gameRequests[gameRequestId].createdAt > 0,
            "Game request does not exist"
        );
        require(
            teams[gameRequests[gameRequestId].team1id].wallet == msg.sender,
            "You are not the owner of request"
        );
        require(
            gameRequests[gameRequestId].createdAt + 1 minutes < block.timestamp,
            "Game request is not expired (1 minute)"
        );

        GameLib.cancelGameRequest(gameRequests, teams, gameRequestId);
    }

    // startGame should be called by team2 owner
    function startGame(uint256 gameRequestId) public returns (uint256) {
        require(
            gameRequests[gameRequestId].createdAt > 0,
            "Game request does not exist"
        );
        require(
            teams[gameRequests[gameRequestId].team2id].wallet == msg.sender,
            "Team2 owner should call startGame"
        );

        require(
            !teams[gameRequests[gameRequestId].team1id].hasActiveGame,
            "Team1 have ongoing game already"
        );
        require(
            !teams[gameRequests[gameRequestId].team2id].hasActiveGame,
            "Team2 have ongoing game already"
        );

        if (teams[gameRequests[gameRequestId].team2id].gameRequestId > 0) {
            GameLib.cancelGameRequest(
                gameRequests,
                teams,
                teams[gameRequests[gameRequestId].team2id].gameRequestId
            );
        }

        GameLib.GameRequest storage gameRequest = gameRequests[gameRequestId];
        uint256 team1id = gameRequest.team1id;
        uint256 team2id = gameRequest.team2id;

        nextGameId++;

        GameLib.Game memory game = GameLib.createGame(
            team1id,
            team2id,
            nextGameId,
            teams[team1id].eloRating,
            teams[team2id].eloRating
        );

        games[game.gameId] = game;

        GameLib.cancelGameRequest(gameRequests, teams, gameRequestId);

        teams[team1id].hasActiveGame = true;
        teams[team2id].hasActiveGame = true;

        teams[team1id].games.push(game.gameId);
        teams[team2id].games.push(game.gameId);

        activeGameCount++;

        return game.gameId;
    }

    function commitGameActions(
        uint256 gameId,
        GameLib.TeamEnum team,
        GameLib.GameAction[] calldata actions
    ) public gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        require(game.status == GameLib.GameStatus.ACTIVE, "Game is not active");
        require(actions.length > 0, "No actions to commit");

        if (
            game.lastMoveTeam != team &&
            game.lastMoveAt + GameLib.MAX_MOVE_TIME < block.timestamp
        ) {
            _finishGame(gameId, GameLib.FinishReason.MOVE_TIMEOUT);
            return;
        }
        if (game.movesMade > GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
            return;
        }

        bool bothTeamsCommitted = GameLib.commitGameActions(
            game,
            team,
            actions
        );

        if (bothTeamsCommitted) {
            emit gameActionCommitted(
                gameId,
                block.timestamp,
                game.team1Actions,
                game.team2Actions
            );
        }
    }

    function _finishGame(
        uint256 gameId,
        GameLib.FinishReason finishReason
    ) internal {
        GameLib.Game storage game = games[gameId];
        GameLib.finishGame(
            game,
            teams[game.team1id],
            teams[game.team2id],
            finishReason
        );

        // Update ELO ratings if game finished normally (not by timeout)
        if (finishReason == GameLib.FinishReason.MAX_MOVES_REACHED) {
            _updateEloRatings(gameId);
        }

        activeGameCount--;
        emit GameFinished(gameId, game.winner, finishReason);
    }

    function finishGameByTimeout(uint256 gameId) public gameExists(gameId) {
        GameLib.Game storage game = games[gameId];
        require(game.status == GameLib.GameStatus.ACTIVE, "Game is not active");
        require(
            teams[game.team1id].wallet == msg.sender ||
                teams[game.team2id].wallet == msg.sender,
            "Your wallet is not participating in the game"
        );
        require(
            game.team1Actions.length == 0 || game.team2Actions.length == 0,
            "All moves has been made - cannot finish game by timeout"
        );
        require(
            game.lastMoveAt + GameLib.MAX_MOVE_TIME < block.timestamp,
            "Timeout is not reached"
        );

        _finishGame(gameId, GameLib.FinishReason.MOVE_TIMEOUT);
    }

    function newGameState(
        uint256 gameId,
        GameLib.GameState calldata gameState,
        string memory errorMsg
    ) public gameExists(gameId) onlyGelato {
        GameLib.Game storage game = games[gameId];

        if (bytes(errorMsg).length > 0) {
            emit GameStateError(gameId, block.timestamp, errorMsg);
            return;
        }

        GameLib.newGameState(game, gameState);
        emit NewGameState(gameId, block.timestamp, gameState);

        if (gameState.stateType == GameLib.StateType.GOAL_TEAM1) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM1);
        } else if (gameState.stateType == GameLib.StateType.GOAL_TEAM2) {
            emit GoalScored(gameId, GameLib.TeamEnum.TEAM2);
        }

        if (game.movesMade >= GameLib.MAX_MOVES) {
            _finishGame(gameId, GameLib.FinishReason.MAX_MOVES_REACHED);
        }
    }

    // View functions for accessing game data
    function getGame(uint256 gameId) public view returns (GameLib.Game memory) {
        return games[gameId];
    }

    function getTeam(uint256 teamId) public view returns (GameLib.Team memory) {
        return teams[teamId];
    }

    function getGameRequest(
        uint256 requestId
    ) public view returns (GameLib.GameRequest memory) {
        return gameRequests[requestId];
    }

    function getTeamIdByWallet(address wallet) public view returns (uint256) {
        return teamIdByWallet[wallet];
    }

    modifier gameExists(uint256 gameId) {
        require(games[gameId].createdAt > 0, "Game does not exist");
        _;
    }

    modifier onlyGelato() {
        require(
            msg.sender == gelatoAddress,
            "Only gelato can call this function"
        );
        _;
    }

    /**
     * @dev Update ELO ratings for both teams after a game
     * @param gameId The ID of the finished game
     */
    function _updateEloRatings(uint256 gameId) private {
        GameLib.Game storage game = games[gameId];
        GameLib.Team storage team1 = teams[game.team1id];
        GameLib.Team storage team2 = teams[game.team2id];

        // Calculate new ELO ratings
        (uint64 newTeam1Rating, uint64 newTeam2Rating) = EloCalculationLib
            .calculateNewRatings(
                game.team1EloRating,
                game.team2EloRating,
                game.team1Score,
                game.team2score
            );

        uint64 eloDelta;
        if (game.team1Score > game.team2score) {
            eloDelta = newTeam1Rating - game.team1EloRating;
        } else if (game.team1Score < game.team2score) {
            eloDelta = newTeam2Rating - game.team2EloRating;
        }

        // Update team ratings
        team1.eloRating = newTeam1Rating;
        team2.eloRating = newTeam2Rating;
        game.eloRatingDelta = eloDelta;
    }
}

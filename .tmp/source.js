// web3-functions/game-worker/index.ts
import {
  Web3Function
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, Interface } from "ethers";

// web3-functions/game-worker/abi.ts
var SmartContractABI = [
  {
    "name": "gameActionCommitted",
    "type": "event",
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ]
  },
  {
    "name": "GameStarted",
    "type": "event",
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "enum GameLib.TeamEnum",
        "name": "teamWithBall",
        "type": "uint8"
      }
    ]
  },
  {
    "name": "GameRequestCreated",
    "type": "event",
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameRequestId",
        "type": "uint256"
      }
    ]
  },
  {
    "name": "getGame",
    "type": "function",
    "stateMutability": "view",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "gameId",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "createdAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "lastMoveAt",
            "type": "uint256"
          },
          {
            "internalType": "enum GameLib.TeamEnum",
            "name": "lastMoveTeam",
            "type": "uint8"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "teamId",
                "type": "uint256"
              },
              {
                "internalType": "uint8",
                "name": "score",
                "type": "uint8"
              },
              {
                "internalType": "uint64",
                "name": "eloRating",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "eloRatingNew",
                "type": "uint64"
              },
              {
                "internalType": "enum GameLib.TeamFormation",
                "name": "formation",
                "type": "uint8"
              },
              {
                "components": [
                  {
                    "internalType": "uint256",
                    "name": "playerId",
                    "type": "uint256"
                  },
                  {
                    "internalType": "enum GameLib.MoveType",
                    "name": "moveType",
                    "type": "uint8"
                  },
                  {
                    "components": [
                      {
                        "internalType": "uint8",
                        "name": "x",
                        "type": "uint8"
                      },
                      {
                        "internalType": "uint8",
                        "name": "y",
                        "type": "uint8"
                      }
                    ],
                    "internalType": "struct GameLib.Position",
                    "name": "oldPosition",
                    "type": "tuple"
                  },
                  {
                    "components": [
                      {
                        "internalType": "uint8",
                        "name": "x",
                        "type": "uint8"
                      },
                      {
                        "internalType": "uint8",
                        "name": "y",
                        "type": "uint8"
                      }
                    ],
                    "internalType": "struct GameLib.Position",
                    "name": "newPosition",
                    "type": "tuple"
                  }
                ],
                "internalType": "struct GameLib.GameAction[]",
                "name": "actions",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct GameLib.TeamInfo",
            "name": "team1",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint256",
                "name": "teamId",
                "type": "uint256"
              },
              {
                "internalType": "uint8",
                "name": "score",
                "type": "uint8"
              },
              {
                "internalType": "uint64",
                "name": "eloRating",
                "type": "uint64"
              },
              {
                "internalType": "uint64",
                "name": "eloRatingNew",
                "type": "uint64"
              },
              {
                "internalType": "enum GameLib.TeamFormation",
                "name": "formation",
                "type": "uint8"
              },
              {
                "components": [
                  {
                    "internalType": "uint256",
                    "name": "playerId",
                    "type": "uint256"
                  },
                  {
                    "internalType": "enum GameLib.MoveType",
                    "name": "moveType",
                    "type": "uint8"
                  },
                  {
                    "components": [
                      {
                        "internalType": "uint8",
                        "name": "x",
                        "type": "uint8"
                      },
                      {
                        "internalType": "uint8",
                        "name": "y",
                        "type": "uint8"
                      }
                    ],
                    "internalType": "struct GameLib.Position",
                    "name": "oldPosition",
                    "type": "tuple"
                  },
                  {
                    "components": [
                      {
                        "internalType": "uint8",
                        "name": "x",
                        "type": "uint8"
                      },
                      {
                        "internalType": "uint8",
                        "name": "y",
                        "type": "uint8"
                      }
                    ],
                    "internalType": "struct GameLib.Position",
                    "name": "newPosition",
                    "type": "tuple"
                  }
                ],
                "internalType": "struct GameLib.GameAction[]",
                "name": "actions",
                "type": "tuple[]"
              }
            ],
            "internalType": "struct GameLib.TeamInfo",
            "name": "team2",
            "type": "tuple"
          },
          {
            "components": [
              {
                "components": [
                  {
                    "internalType": "uint8",
                    "name": "x",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "y",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct GameLib.Position[]",
                "name": "team1Positions",
                "type": "tuple[]"
              },
              {
                "components": [
                  {
                    "internalType": "uint8",
                    "name": "x",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "y",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct GameLib.Position[]",
                "name": "team2Positions",
                "type": "tuple[]"
              },
              {
                "components": [
                  {
                    "internalType": "uint8",
                    "name": "x",
                    "type": "uint8"
                  },
                  {
                    "internalType": "uint8",
                    "name": "y",
                    "type": "uint8"
                  }
                ],
                "internalType": "struct GameLib.Position",
                "name": "ballPosition",
                "type": "tuple"
              },
              {
                "internalType": "enum GameLib.TeamEnum",
                "name": "ballOwner",
                "type": "uint8"
              },
              {
                "internalType": "uint8[]",
                "name": "clashRandomResults",
                "type": "uint8[]"
              },
              {
                "internalType": "enum GameLib.StateType",
                "name": "stateType",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.GameState[]",
            "name": "history",
            "type": "tuple[]"
          },
          {
            "internalType": "enum GameLib.GameStatus",
            "name": "status",
            "type": "uint8"
          },
          {
            "internalType": "uint8",
            "name": "movesMade",
            "type": "uint8"
          },
          {
            "internalType": "enum GameLib.TeamEnum",
            "name": "winner",
            "type": "uint8"
          }
        ],
        "internalType": "struct GameLib.Game",
        "name": "",
        "type": "tuple"
      }
    ]
  },
  {
    "name": "getTeam",
    "type": "function",
    "stateMutability": "view",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "teamId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "id",
            "type": "uint256"
          },
          {
            "internalType": "address",
            "name": "wallet",
            "type": "address"
          },
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "uint64",
            "name": "eloRating",
            "type": "uint64"
          },
          {
            "internalType": "uint256",
            "name": "registeredAt",
            "type": "uint256"
          },
          {
            "internalType": "uint256[]",
            "name": "games",
            "type": "uint256[]"
          },
          {
            "internalType": "uint8",
            "name": "country",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "hasActiveGame",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "gameRequestId",
            "type": "uint256"
          },
          {
            "components": [
              {
                "internalType": "uint32",
                "name": "wins",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "losses",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "draws",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "totalGames",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "totalGoalsScored",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "totalGoalsConceded",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "biggestWinGoalsScored",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "biggestWinGoalsConceded",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "biggestLossGoalsScored",
                "type": "uint32"
              },
              {
                "internalType": "uint32",
                "name": "biggestLossGoalsConceded",
                "type": "uint32"
              }
            ],
            "internalType": "struct GameLib.GameStatistics",
            "name": "statistic",
            "type": "tuple"
          }
        ],
        "internalType": "struct GameLib.Team",
        "name": "",
        "type": "tuple"
      }
    ]
  },
  {
    "name": "newGameState",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "components": [
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "x",
                "type": "uint8"
              },
              {
                "internalType": "uint8",
                "name": "y",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.Position[]",
            "name": "team1Positions",
            "type": "tuple[]"
          },
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "x",
                "type": "uint8"
              },
              {
                "internalType": "uint8",
                "name": "y",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.Position[]",
            "name": "team2Positions",
            "type": "tuple[]"
          },
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "x",
                "type": "uint8"
              },
              {
                "internalType": "uint8",
                "name": "y",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.Position",
            "name": "ballPosition",
            "type": "tuple"
          },
          {
            "internalType": "enum GameLib.TeamEnum",
            "name": "ballOwner",
            "type": "uint8"
          },
          {
            "internalType": "uint8[]",
            "name": "clashRandomResults",
            "type": "uint8[]"
          },
          {
            "internalType": "enum GameLib.StateType",
            "name": "stateType",
            "type": "uint8"
          }
        ],
        "internalType": "struct GameLib.GameState",
        "name": "gameState",
        "type": "tuple"
      }
    ],
    "outputs": []
  },
  {
    "name": "createTeam",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "uint8",
        "name": "country",
        "type": "uint8"
      }
    ],
    "outputs": []
  },
  {
    "name": "createGameRequest",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "team1id",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "team2id",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "name": "startGame",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameRequestId",
        "type": "uint256"
      }
    ],
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "name": "commitGameActions",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "enum GameLib.TeamEnum",
        "name": "team",
        "type": "uint8"
      },
      {
        "components": [
          {
            "internalType": "uint256",
            "name": "playerId",
            "type": "uint256"
          },
          {
            "internalType": "enum GameLib.MoveType",
            "name": "moveType",
            "type": "uint8"
          },
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "x",
                "type": "uint8"
              },
              {
                "internalType": "uint8",
                "name": "y",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.Position",
            "name": "oldPosition",
            "type": "tuple"
          },
          {
            "components": [
              {
                "internalType": "uint8",
                "name": "x",
                "type": "uint8"
              },
              {
                "internalType": "uint8",
                "name": "y",
                "type": "uint8"
              }
            ],
            "internalType": "struct GameLib.Position",
            "name": "newPosition",
            "type": "tuple"
          }
        ],
        "internalType": "struct GameLib.GameAction[]",
        "name": "actions",
        "type": "tuple[]"
      }
    ],
    "outputs": []
  },
  {
    "name": "getTeamIdByWallet",
    "type": "function",
    "stateMutability": "view",
    "inputs": [
      {
        "internalType": "address",
        "name": "wallet",
        "type": "address"
      }
    ],
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ]
  },
  {
    "name": "setGameError",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "enum GameLib.TeamEnum",
        "name": "cauzedByTeam",
        "type": "uint8"
      },
      {
        "internalType": "enum GameLib.ErrorType",
        "name": "errorType",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "errorMsg",
        "type": "string"
      }
    ],
    "outputs": []
  }
];

// frontend/src/lib/game.ts
var FIELD_WIDTH = 15;
var FIELD_HEIGHT = 11;
var DISTANCE_PASS = 3;
var DISTANCE_SHOT = 4;
var DISTANCE_MOVE = 2;
var DISTANCE_TACKLE = 1;
var ValidationError = class extends Error {
  cauzedByTeam;
  cauzedByPlayerId;
  move;
  message;
  constructor(cauzedByTeam, cauzedByPlayerId, move, message) {
    super(`Move validation failed for ${cauzedByTeam} player ${cauzedByPlayerId}: ${message}`);
    this.name = "ValidationError";
    this.cauzedByTeam = cauzedByTeam;
    this.cauzedByPlayerId = cauzedByPlayerId;
    this.move = move;
    this.message = message;
  }
};
function isPosEquals(pos1, pos2) {
  return Number(pos1.x) === Number(pos2.x) && Number(pos1.y) === Number(pos2.y);
}
var Game = class {
  gameId;
  history;
  team1;
  team2;
  playerMoves;
  ball;
  createdAt;
  status;
  constructor(gameId) {
    this.gameId = gameId;
    this.history = [];
    this.team1 = { id: 1, enum: "team1" /* TEAM1 */, name: "Team 1", color: "red", score: 0, players: [], isCommittedMove: false };
    this.team2 = { id: 2, enum: "team2" /* TEAM2 */, name: "Team 2", color: "blue", score: 0, players: [], isCommittedMove: false };
    this.ball = { position: { x: 0, y: 0 }, oldPosition: null, ownerTeam: null };
    this.createdAt = Date.now();
    this.status = "WAITING";
    this.playerMoves = [];
    let playerTypeByIndex = function(index) {
      if (index == 0) {
        return "goalkeeper";
      }
      if (index == 1 || index == 2) {
        return "defender";
      }
      if (index == 3 || index == 4) {
        return "midfielder";
      }
      if (index == 5) {
        return "forward";
      }
      return "defender";
    };
    for (let i = 0; i < 6; i++) {
      const playerKey = `1_${i}`;
      this.team1.players[i] = {
        id: i,
        team: this.team1,
        position: { x: 0, y: 0 },
        oldPosition: null,
        ball: null,
        playerType: playerTypeByIndex(i),
        key: () => playerKey
      };
    }
    for (let i = 0; i < 6; i++) {
      const playerKey = `2_${i}`;
      this.team2.players[i] = {
        id: i,
        team: this.team2,
        position: { x: 0, y: 0 },
        oldPosition: null,
        ball: null,
        playerType: playerTypeByIndex(i),
        key: () => playerKey
      };
    }
  }
  newGame(gameId, teamWithBall) {
    this.gameId = gameId;
    this.status = "ACTIVE";
    this.ball.position = { x: 8, y: 5 };
    fillStartPositions(this.team1, this.team2, this.ball, teamWithBall);
    this.saveState(fillState(this.team1, this.team2, this.ball, "startPositions"));
  }
  doPlayerMove(player, type, oldPosition, newPosition, render = true) {
    const alreadyDoneMove = this.playerMoves.find((move) => move.playerId === player.id && move.teamEnum === player.team.enum);
    if (alreadyDoneMove) {
      throw new ValidationError(
        player.team.enum,
        player.id,
        { playerId: player.id, teamEnum: player.team.enum, moveType: type, oldPosition, newPosition, playerKey: player.key },
        "Player already made a move"
      );
    }
    this.playerMoves.push({ playerId: player.id, teamEnum: player.team.enum, moveType: type, oldPosition, newPosition, playerKey: player.key });
    if (render) {
      this._renderPlayerMove(player, type, oldPosition, newPosition);
    }
  }
  undoPlayerMove(player, render = true) {
    const index = this.playerMoves.findIndex((move) => move.playerId === player.id && move.teamEnum === player.team.enum);
    if (index == -1) {
      throw new Error("Player did not make a move");
    }
    this.playerMoves.splice(index, 1);
    if (render) {
      this._renderPlayerUndoMove(player);
    }
  }
  _renderPlayerMove(player, type, oldPosition, newPosition) {
    switch (type) {
      case "pass" /* PASS */:
        if (!player.ball) {
          throw new Error("Player does not have a ball");
        }
        player.ball.oldPosition = player.ball.position;
        player.ball.position = newPosition;
        player.oldPosition = oldPosition;
        break;
      default:
        if (player.ball) {
          player.ball.oldPosition = player.ball.position;
          player.ball.position = newPosition;
        }
        player.oldPosition = oldPosition;
        player.position = newPosition;
    }
    if (this.ball.ownerTeam == player.team.enum && isPosEquals(player.position, this.ball.position)) {
      this.changeBallOwner(player);
    }
  }
  changeBallOwner(player) {
    this.team1.players.forEach((player2) => {
      player2.ball = null;
    });
    this.team2.players.forEach((player2) => {
      player2.ball = null;
    });
    if (player) {
      player.ball = this.ball;
      this.ball.ownerTeam = player.team.enum;
    } else {
      this.ball.ownerTeam = null;
    }
  }
  _renderPlayerUndoMove(player) {
    if (player.ball?.oldPosition && isPosEquals(player.ball.oldPosition, player.oldPosition)) {
      this.ball.position = player.ball.oldPosition;
      this.ball.oldPosition = null;
      this.changeBallOwner(player);
    } else if (this.ball.ownerTeam == player.team.enum && isPosEquals(this.ball.position, player.position)) {
      this.changeBallOwner(null);
    }
    player.position = player.oldPosition;
    player.oldPosition = null;
  }
  // when two team made their moves and commited
  commitMove(player) {
    const team = player === "team1" /* TEAM1 */ ? this.team1 : this.team2;
    if (team.isCommittedMove) {
      throw new Error("Team already committed a move");
    }
    if (this.playerMoves.length == 0) {
      throw new Error("No moves to commit");
    }
    const teamMoves = this.playerMoves.filter((move) => move.teamEnum === team.enum);
    if (teamMoves.length == 0) {
      throw new Error("No moves to commit for current team");
    }
    team.isCommittedMove = true;
  }
  calculateNewState() {
    if (!this.team1.isCommittedMove || !this.team2.isCommittedMove) {
      throw new Error("Not all team committed their moves");
    }
    this.restoreState(this.history[this.history.length - 1]);
    let randomNumbers = [];
    let destinationMap = {};
    for (const move of this.playerMoves) {
      const availablePath = this.calculatePath(move.oldPosition, move.newPosition, move.moveType);
      const allowedCells = move.moveType == "tackle" /* TACKLE */ ? [...availablePath, move.oldPosition] : availablePath;
      if (!allowedCells.some((cell) => isPosEquals(cell, move.newPosition))) {
        throw new ValidationError(
          move.teamEnum,
          move.playerId,
          move,
          `Move is not valid for player ${move.playerId}, team ${move.teamEnum}, type ${move.moveType}`
        );
      }
      const playerKey2 = move.moveType == "pass" /* PASS */ || move.moveType == "shot" /* SHOT */ ? "ball" : move.playerKey();
      const key = `${playerKey2}_${move.newPosition.x}_${move.newPosition.y}`;
      if (destinationMap[key]) {
        throw new ValidationError(
          move.teamEnum,
          move.playerId,
          move,
          "Cannot move two players from the same team to the same position"
        );
      }
      destinationMap[key] = true;
    }
    let maxPathSize = 0;
    let playerPaths = {};
    let playerMoveType = {};
    for (const move of this.playerMoves) {
      var playerKey = move.playerKey();
      if (move.moveType == "pass" /* PASS */ || move.moveType == "shot" /* SHOT */) {
        playerKey = "ball";
      }
      playerPaths[playerKey] = this.calculatePath(move.oldPosition, move.newPosition, move.moveType);
      playerMoveType[playerKey] = move.moveType;
      if (playerPaths[playerKey].length > maxPathSize) {
        maxPathSize = playerPaths[playerKey].length;
      }
    }
    var rendererStates = [];
    for (let i = 0; i < maxPathSize; i++) {
      let isBallChangedPosition = false;
      for (const player of [...this.team1.players, ...this.team2.players]) {
        if (playerPaths[player.key()] && playerPaths[player.key()].length > i) {
          player.position = playerPaths[player.key()][i];
          if (player.ball) {
            isBallChangedPosition = true;
            player.ball.position = playerPaths[player.key()][i];
          }
        }
      }
      if (playerPaths["ball"] && playerPaths["ball"].length > i) {
        this.ball.position = playerPaths["ball"][i];
        isBallChangedPosition = true;
        const goalForTeam = isGoalForTeam(this.ball.position);
        if (goalForTeam) {
          if (goalForTeam == "team1" /* TEAM1 */) {
            this.team2.score++;
          } else {
            this.team1.score++;
          }
          rendererStates.push(fillState(this.team1, this.team2, this.ball, "goal"));
          fillStartPositions(this.team1, this.team2, this.ball, goalForTeam);
          rendererStates.push(fillState(this.team1, this.team2, this.ball, "startPositions"));
          break;
        }
      }
      if (isBallChangedPosition) {
        const team1Player = this.team1.players.find((player) => isPosEquals(player.position, this.ball.position));
        const team2Player = this.team2.players.find((player) => isPosEquals(player.position, this.ball.position));
        if (team1Player && team2Player) {
          const player1MoveType = playerMoveType[team1Player.key()];
          const player2MoveType = playerMoveType[team2Player.key()];
          const { winner: newBallOwner, randomNumber } = resolveClash(team1Player, player1MoveType, team2Player, player2MoveType);
          console.log("resolveClash newBallOwner", newBallOwner);
          const winningPlayer = newBallOwner === "team1" /* TEAM1 */ ? team1Player : team2Player;
          if (randomNumber > 0) {
            randomNumbers.push(randomNumber);
          }
          this.changeBallOwner(winningPlayer);
        } else {
          if (team1Player) {
            this.changeBallOwner(team1Player);
          } else if (team2Player) {
            this.changeBallOwner(team2Player);
          }
        }
      }
      rendererStates.push(fillState(this.team1, this.team2, this.ball, "move"));
    }
    this.team1.players.forEach((player) => {
      player.oldPosition = null;
    });
    this.team2.players.forEach((player) => {
      player.oldPosition = null;
    });
    this.ball.oldPosition = null;
    this.team1.isCommittedMove = false;
    this.team2.isCommittedMove = false;
    this.playerMoves = [];
    const finalState = rendererStates[rendererStates.length - 1];
    if (randomNumbers.length > 0) {
      finalState.clashRandomResults = randomNumbers;
    }
    this.saveState(finalState);
    console.log("finalState", finalState);
    return { newState: finalState, rendererStates };
  }
  saveState(state) {
    this.history.push(state);
  }
  restoreState(state) {
    this.team1.isCommittedMove = false;
    this.team2.isCommittedMove = false;
    this.team1.players.forEach((player) => {
      player.position = state.team1PlayerPositions[player.id];
      if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
        this.changeBallOwner(player);
      }
    });
    this.team2.players.forEach((player) => {
      player.position = state.team2PlayerPositions[player.id];
      if (state.ballPosition && isPosEquals(state.ballPosition, player.position)) {
        this.changeBallOwner(player);
      }
    });
    this.ball.position = state.ballPosition;
  }
  // Calculate available cells for player movement
  calculateAvailableCells(player, moveType) {
    const availableCells = [];
    const currentPos = player.position;
    const distanceSize = this.getDistanceSize(player, moveType);
    const directions = [
      { dx: 0, dy: -distanceSize },
      // top
      { dx: distanceSize, dy: 0 },
      // right
      { dx: 0, dy: distanceSize },
      // bottom
      { dx: -distanceSize, dy: 0 },
      // left
      { dx: -distanceSize, dy: -distanceSize },
      // top-left (diagonal)
      { dx: distanceSize, dy: -distanceSize },
      // top-right (diagonal)
      { dx: -distanceSize, dy: distanceSize },
      // bottom-left (diagonal)
      { dx: distanceSize, dy: distanceSize }
      // bottom-right (diagonal)
    ];
    for (const direction of directions) {
      const newPos = {
        x: currentPos.x + direction.dx,
        y: currentPos.y + direction.dy
      };
      const path = this.calculatePath(currentPos, newPos, moveType);
      for (const cell of path) {
        if ((moveType == "run" /* RUN */ || moveType == "tackle" /* TACKLE */) && this.isPositionOccupied(cell, player.team)) {
          continue;
        }
        availableCells.push(cell);
      }
    }
    if (moveType == "tackle" /* TACKLE */) {
      availableCells.push(currentPos);
    }
    return availableCells;
  }
  // Determine distance size based on player and move type
  getDistanceSize(player, moveType) {
    switch (moveType) {
      case "pass" /* PASS */:
        return DISTANCE_PASS;
      case "shot" /* SHOT */:
        return DISTANCE_SHOT;
      case "run" /* RUN */:
        return DISTANCE_MOVE;
      case "tackle" /* TACKLE */:
        return DISTANCE_TACKLE;
      default:
        return DISTANCE_MOVE;
    }
  }
  // Check if a position is occupied by any player
  isPositionOccupied(position, team) {
    for (const player of team.players) {
      if (isPosEquals(player.position, position)) {
        return true;
      }
    }
    return false;
  }
  // Calculate all cells along the path from cell A to cell B
  calculatePath(from, to, moveType) {
    const path = [];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
    const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i++) {
      const x = from.x + stepX * i;
      const y = from.y + stepY * i;
      if (x >= 1 && x <= FIELD_WIDTH + 1 - 1 && y >= 0 && y <= FIELD_HEIGHT - 1 || (moveType == "pass" /* PASS */ || moveType == "shot" /* SHOT */) && isPositionInGates({ x, y })) {
        path.push({ x, y });
      } else {
        break;
      }
    }
    return path;
  }
};
function resolveClash(team1Player, team1MoveType, team2Player, team2MoveType) {
  console.log("resolveClash", team1Player, team1MoveType, team2Player, team2MoveType);
  if (team1Player.ball && team2MoveType == "tackle" /* TACKLE */) {
    console.log("team2Player win cauze of tackle");
    return { winner: "team2" /* TEAM2 */, randomNumber: 0 };
  }
  if (team2Player.ball && team1MoveType == "tackle" /* TACKLE */) {
    console.log("team1Player win cauze of tacke");
    return { winner: "team1" /* TEAM1 */, randomNumber: 0 };
  }
  const random = Math.random();
  console.log("random win", random);
  return { winner: random < 0.5 ? "team1" /* TEAM1 */ : "team2" /* TEAM2 */, randomNumber: random };
}
function isPositionInGates(position) {
  return position.x == 0 && position.y >= 3 && position.y <= 7 || position.x == 16 && position.y >= 3 && position.y <= 7;
}
function isGoalForTeam(position) {
  if (position.x == 0 && position.y >= 3 && position.y <= 7) {
    return "team1" /* TEAM1 */;
  }
  if (position.x == 16 && position.y >= 3 && position.y <= 7) {
    return "team2" /* TEAM2 */;
  }
  return null;
}
function fillState(team1, team2, ball, type = "move") {
  const state = {
    team1PlayerPositions: team1.players.map((player) => player.position),
    team2PlayerPositions: team2.players.map((player) => player.position),
    ballPosition: ball.position,
    ballOwner: ball.ownerTeam || null,
    type,
    clashRandomResults: []
  };
  return state;
}
function fillStartPositions(team1, team2, ball, teamWithBall) {
  if (teamWithBall === "team1" /* TEAM1 */) {
    ball.ownerTeam = team1.players[5].team.enum;
    team1.players[0].position = { x: 1, y: 5 };
    team1.players[1].playerType = "defender";
    team1.players[1].position = { x: 4, y: 2 };
    team1.players[2].playerType = "defender";
    team1.players[2].position = { x: 4, y: 8 };
    team1.players[3].playerType = "midfielder";
    team1.players[3].position = { x: 6, y: 3 };
    team1.players[4].playerType = "midfielder";
    team1.players[4].position = { x: 6, y: 7 };
    team1.players[5].playerType = "forward";
    team1.players[5].position = { x: 8, y: 5 };
    team1.players[5].ball = ball;
    team2.players[0].position = { x: 15, y: 5 };
    team2.players[1].position = { x: 12, y: 2 };
    team2.players[2].position = { x: 12, y: 8 };
    team2.players[3].position = { x: 10, y: 2 };
    team2.players[4].position = { x: 10, y: 8 };
    team2.players[5].position = { x: 10, y: 5 };
    ball.position = team1.players[5].position;
  } else {
    ball.ownerTeam = team2.players[5].team.enum;
    team1.players[0].position = { x: 1, y: 5 };
    team1.players[1].position = { x: 4, y: 2 };
    team1.players[2].position = { x: 4, y: 8 };
    team1.players[3].position = { x: 6, y: 2 };
    team1.players[4].position = { x: 6, y: 8 };
    team1.players[5].position = { x: 6, y: 5 };
    team2.players[0].position = { x: 15, y: 5 };
    team2.players[1].position = { x: 12, y: 2 };
    team2.players[2].position = { x: 12, y: 8 };
    team2.players[3].position = { x: 10, y: 3 };
    team2.players[4].position = { x: 10, y: 7 };
    team2.players[5].position = { x: 8, y: 5 };
    team2.players[5].ball = ball;
    ball.position = team2.players[5].position;
  }
}

// web3-functions/game-worker/structs.ts
var CONTRACT_ENUMS = {
  TEAM: {
    TEAM1: 1,
    TEAM2: 2,
    NONE: 0
  },
  STATE_TYPE: {
    START_POSITIONS: 0,
    MOVE: 1,
    GOAL: 2
  },
  MOVE_TYPE: {
    PASS: 0,
    TACKLE: 1,
    RUN: 2,
    SHOT: 3
  },
  GAME_STATUS: {
    NONE: 0,
    ACTIVE: 1,
    FINISHED: 2,
    FINISHED_BY_TIMEOUT: 3
  },
  ERROR_TYPE: {
    UNSPECIFIED: 0,
    MOVE_VALIDATION_ERROR: 1
  }
};
function mapContractGameStateToTS(contractGameState) {
  const convertPosition = (pos) => ({
    x: Number(pos.x),
    y: Number(pos.y)
  });
  const convertPositions = (positions) => positions.map(convertPosition);
  return {
    team1PlayerPositions: convertPositions(contractGameState.team1Positions),
    team2PlayerPositions: convertPositions(contractGameState.team2Positions),
    ballPosition: convertPosition(contractGameState.ballPosition),
    ballOwner: contractGameState.ballOwner === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" : contractGameState.ballOwner === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : null,
    type: contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS ? "startPositions" : contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.MOVE ? "move" : contractGameState.stateType === CONTRACT_ENUMS.STATE_TYPE.GOAL ? "goal" : "startPositions",
    clashRandomResults: contractGameState.clashRandomResults
  };
}
function mapGameStateToContract(tsGameState) {
  if (!tsGameState.team1PlayerPositions || !tsGameState.team2PlayerPositions) {
    throw new Error("Player positions are required");
  }
  if (!tsGameState.ballPosition) {
    throw new Error("Ball position is required");
  }
  return {
    team1Positions: tsGameState.team1PlayerPositions,
    team2Positions: tsGameState.team2PlayerPositions,
    ballPosition: tsGameState.ballPosition,
    ballOwner: tsGameState.ballOwner === "team1" ? CONTRACT_ENUMS.TEAM.TEAM1 : tsGameState.ballOwner === "team2" ? CONTRACT_ENUMS.TEAM.TEAM2 : CONTRACT_ENUMS.TEAM.NONE,
    clashRandomResults: tsGameState.clashRandomResults || [],
    stateType: tsGameState.type === "startPositions" ? CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS : tsGameState.type === "move" ? CONTRACT_ENUMS.STATE_TYPE.MOVE : tsGameState.type === "goal" ? CONTRACT_ENUMS.STATE_TYPE.GOAL : CONTRACT_ENUMS.STATE_TYPE.START_POSITIONS
  };
}
function mapContractActionToTS(contractAction) {
  const convertPosition = (pos) => ({
    x: Number(pos.x),
    y: Number(pos.y)
  });
  return {
    playerId: Number(contractAction.playerId),
    teamEnum: "team1" /* TEAM1 */,
    // Default to TEAM1, will be overridden by the actual team
    moveType: getMoveTypeEnum(Number(contractAction.moveType)),
    oldPosition: convertPosition(contractAction.oldPosition),
    newPosition: convertPosition(contractAction.newPosition)
  };
}
function getMoveTypeEnum(moveTypeNumber) {
  switch (moveTypeNumber) {
    case CONTRACT_ENUMS.MOVE_TYPE.PASS:
      return "pass" /* PASS */;
    case CONTRACT_ENUMS.MOVE_TYPE.TACKLE:
      return "tackle" /* TACKLE */;
    case CONTRACT_ENUMS.MOVE_TYPE.RUN:
      return "run" /* RUN */;
    case CONTRACT_ENUMS.MOVE_TYPE.SHOT:
      return "shot" /* SHOT */;
    default:
      return "pass" /* PASS */;
  }
}
function getTeamEnumNumber(teamEnum) {
  switch (teamEnum) {
    case "team1":
      return CONTRACT_ENUMS.TEAM.TEAM1;
    case "team2":
      return CONTRACT_ENUMS.TEAM.TEAM2;
    default:
      return CONTRACT_ENUMS.TEAM.NONE;
  }
}
function mapContractGameInfoToTS(contractGameInfo) {
  return {
    gameId: Number(contractGameInfo.gameId),
    createdAt: Number(contractGameInfo.createdAt),
    lastMoveAt: Number(contractGameInfo.lastMoveAt),
    lastMoveTeam: Number(contractGameInfo.lastMoveTeam) === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" : Number(contractGameInfo.lastMoveTeam) === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : "none",
    team1: mapContractTeamInfoToTS(contractGameInfo.team1, "team1" /* TEAM1 */),
    team2: mapContractTeamInfoToTS(contractGameInfo.team2, "team2" /* TEAM2 */),
    history: contractGameInfo.history.map(mapContractGameStateToTS),
    status: getGameStatusString(Number(contractGameInfo.status)),
    movesMade: Number(contractGameInfo.movesMade),
    winner: Number(contractGameInfo.winner) === CONTRACT_ENUMS.TEAM.TEAM1 ? "team1" : Number(contractGameInfo.winner) === CONTRACT_ENUMS.TEAM.TEAM2 ? "team2" : "none"
  };
}
function getGameStatusString(gameStatusNumber) {
  switch (gameStatusNumber) {
    case CONTRACT_ENUMS.GAME_STATUS.NONE:
      return "none";
    case CONTRACT_ENUMS.GAME_STATUS.ACTIVE:
      return "active";
    case CONTRACT_ENUMS.GAME_STATUS.FINISHED:
      return "finished";
    case CONTRACT_ENUMS.GAME_STATUS.FINISHED_BY_TIMEOUT:
      return "finishedByTimeout";
    default:
      return "none";
  }
}
function mapContractTeamInfoToTS(contractTeamInfo, teamEnum) {
  return {
    teamId: Number(contractTeamInfo.teamId),
    score: Number(contractTeamInfo.score),
    eloRating: Number(contractTeamInfo.eloRating),
    eloRatingNew: Number(contractTeamInfo.eloRatingNew),
    formation: getTeamFormationString(Number(contractTeamInfo.formation)),
    actions: contractTeamInfo.actions.map((action) => ({
      ...mapContractActionToTS(action),
      teamEnum
    }))
  };
}
function getTeamFormationString(formationNumber) {
  switch (formationNumber) {
    case 0:
      return "default";
    case 1:
      return "defensive";
    case 2:
      return "offensive";
    default:
      return "default";
  }
}

// web3-functions/game-worker/index.ts
Web3Function.onRun(async (context) => {
  const { multiChainProvider, userArgs } = context;
  let smartContract = null;
  let gameId = 0;
  try {
    const provider = multiChainProvider.default();
    smartContract = new Contract(
      userArgs.smartContractAddress,
      SmartContractABI,
      provider
    );
    const iface = new Interface(SmartContractABI);
    const result = await processGameActions(context, smartContract, iface);
    gameId = result.gameId;
    let callData = [];
    result.statesToSend.forEach((state) => {
      const contractGameState = mapGameStateToContract(state);
      callData.push({
        to: userArgs.smartContractAddress,
        data: smartContract.interface.encodeFunctionData("newGameState", [gameId, contractGameState])
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
      callData
    };
  } catch (error) {
    console.error("Error in game worker:", error);
    if (error instanceof ValidationError && smartContract) {
      console.log("ValidationError occurred, sending setGameError transaction");
      console.log("Team:", error.cauzedByTeam);
      console.log("Player:", error.cauzedByPlayerId);
      console.log("Message:", error.message);
      const setGameErrorCallData = {
        to: userArgs.smartContractAddress,
        data: smartContract.interface.encodeFunctionData("setGameError", [
          gameId,
          getTeamEnumNumber(error.cauzedByTeam),
          CONTRACT_ENUMS.ERROR_TYPE.MOVE_VALIDATION_ERROR,
          error.message
        ])
      };
      return {
        canExec: true,
        callData: [setGameErrorCallData]
      };
    }
    return {
      canExec: false,
      message: `Game worker error: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
});
async function processGameActions(context, smartContract, iface) {
  const { log, userArgs } = context;
  const event = iface.parseLog(log);
  if (!event || !event.args) {
    throw new Error("Invalid or unparsable event log");
  }
  const { gameId } = event.args;
  console.log("gameId", gameId);
  const contractGameInfo = await smartContract.getGame(gameId);
  const gameInfo = mapContractGameInfoToTS(contractGameInfo);
  console.log("gameInfo.status", contractGameInfo.status, gameInfo.status);
  console.log("GameInfo:", gameInfo);
  const team1Actions = gameInfo.team1?.actions || [];
  const team2Actions = gameInfo.team2?.actions || [];
  console.log("team1Actions", team1Actions);
  console.log("team2Actions", team2Actions);
  if ((team1Actions.length == 0 || team2Actions.length == 0) && gameInfo.history.length > 0) {
    throw new Error("teamActions cannot be empty");
  }
  const game = new Game(gameId);
  game.newGame(gameId, "team1" /* TEAM1 */);
  for (const state of gameInfo.history) {
    game.saveState(state);
  }
  let statesToSend = [];
  if (team1Actions.length == 0 && team2Actions.length == 0 && gameInfo.history.length == 0) {
    console.log("game start");
    statesToSend.push(game.history[0]);
    return { statesToSend, gameId };
  }
  team1Actions.forEach((action) => {
    const player = game.team1.players.find((player2) => player2.id === action.playerId);
    if (!player) {
      throw new ValidationError(
        "team1" /* TEAM1 */,
        action.playerId,
        action,
        `Player ${action.playerId} not found`
      );
    }
    game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
  });
  game.commitMove("team1" /* TEAM1 */);
  team2Actions.forEach((action) => {
    const player = game.team2.players.find((player2) => player2.id === action.playerId);
    if (!player) {
      throw new ValidationError(
        "team2" /* TEAM2 */,
        action.playerId,
        action,
        `Player ${action.playerId} not found`
      );
    }
    game.doPlayerMove(player, action.moveType, action.oldPosition, action.newPosition, false);
  });
  game.commitMove("team2" /* TEAM2 */);
  const { newState, rendererStates } = game.calculateNewState();
  rendererStates.forEach((state) => {
    if (state.type === "goal") {
      statesToSend.push(state);
    }
  });
  statesToSend.push(newState);
  return { statesToSend, gameId };
}

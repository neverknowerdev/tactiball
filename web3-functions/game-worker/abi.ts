export const SmartContractABI = [
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
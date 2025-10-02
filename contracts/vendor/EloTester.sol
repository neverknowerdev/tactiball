// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import "./Elo.sol";

contract EloTester {
    function ratingChange(
        uint256 ratingA,
        uint256 ratingB,
        uint256 score,
        uint256 kFactor
    ) external pure returns (uint256 change, bool negative) {
        return Elo.ratingChange(ratingA, ratingB, score, kFactor);
    }

    function ratingChangeWithGoals(
        uint256 ratingA,
        uint256 ratingB,
        uint8 goalsA,
        uint8 goalsB,
        uint256 kFactor
    ) external pure returns (uint256 change, bool negative) {
        return Elo.ratingChangeWithGoals(ratingA, ratingB, goalsA, goalsB, kFactor);
    }

    function calculateNewRatingsWithGoals(
        uint256 ratingA,
        uint256 ratingB,
        uint8 goalsA,
        uint8 goalsB,
        uint256 kFactor
    ) external pure returns (uint256 newRatingA, uint256 newRatingB) {
        return Elo.calculateNewRatingsWithGoals(ratingA, ratingB, goalsA, goalsB, kFactor);
    }

    function getGoalMultiplier(uint8 goalsA, uint8 goalsB) external pure returns (uint256 multiplier) {
        return Elo.getGoalMultiplier(goalsA, goalsB);
    }

    function getMaxDelta() external pure returns (uint256) {
        return Elo.MAX_DELTA;
    }
}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {FixedPointMathLib as fp} from "solmate/src/utils/FixedPointMathLib.sol";

library Elo {
    uint256 public constant MAX_DELTA = 10000;
    uint256 public constant MIN_DELTA = 0;
    uint256 public constant MAX_GOALS = 20;

    error InvalidScore(uint256 score);
    error InvalidGoals(uint8 goals);

    function sixteenthRoot(uint256 x) internal pure returns (uint256) {
        return fp.sqrt(fp.sqrt(fp.sqrt(fp.sqrt(x))));
    }

    function ratingChange(
        uint256 ratingA,
        uint256 ratingB,
        uint256 score,
        uint256 kFactor
    ) internal pure returns (uint256 change, bool negative) {
        if (score > 100) revert InvalidScore(score);

        uint256 _kFactor = kFactor * 100;
        uint256 kScore = kFactor * score;
        uint256 kExpectedScore;

        if (ratingA == ratingB) {
            kExpectedScore = _kFactor / 2;
        } else {
            bool aIsHigherRated = ratingA > ratingB;
            uint256 absRatingDiff = aIsHigherRated
                ? ratingA - ratingB
                : ratingB - ratingA;

            uint256 cappedAbsRatingDiff = absRatingDiff;
            if (cappedAbsRatingDiff > 1125) {
                cappedAbsRatingDiff = 1125;
            }

            unchecked {
                uint256 expNumerator = cappedAbsRatingDiff / 25;
                uint256 expFactor = sixteenthRoot(fp.rpow(10, expNumerator, 1));

                if (expFactor == 0) expFactor = 1;

                if (aIsHigherRated) {
                    kExpectedScore = (_kFactor * expFactor) / (expFactor + 100);
                } else {
                    kExpectedScore = _kFactor / (100 + expFactor);
                }
            }
        }

        unchecked {
            negative = kScore < kExpectedScore;
            change = negative
                ? kExpectedScore - kScore
                : kScore - kExpectedScore;

            if (change > MAX_DELTA) {
                change = MAX_DELTA;
            }

            if (change < MIN_DELTA) {
                change = MIN_DELTA;
            }
        }
    }

    function getGoalMultiplier(
        uint8 goalsA,
        uint8 goalsB
    ) internal pure returns (uint256 multiplier) {
        if (goalsA == goalsB) {
            return 100;
        }

        uint8 margin = goalsA > goalsB ? goalsA - goalsB : goalsB - goalsA;

        if (margin == 1) return 100;
        if (margin == 2) return 150;
        if (margin == 3) return 175;
        return 200;
    }

    function ratingChangeWithGoals(
        uint256 ratingA,
        uint256 ratingB,
        uint8 goalsA,
        uint8 goalsB,
        uint256 kFactor
    ) internal pure returns (uint256 change, bool negative) {
        if (goalsA > MAX_GOALS || goalsB > MAX_GOALS) {
            revert InvalidGoals(goalsA > goalsB ? goalsA : goalsB);
        }

        uint256 score;
        if (goalsA == goalsB) {
            score = 50;
        } else if (goalsA > goalsB) {
            score = 100;
        } else {
            score = 0;
        }

        (uint256 baseChange, bool baseNegative) = ratingChange(
            ratingA,
            ratingB,
            score,
            kFactor
        );

        if (goalsA != goalsB) {
            uint256 multiplier = getGoalMultiplier(goalsA, goalsB);
            change = (baseChange * multiplier) / 100;
        } else {
            change = baseChange;
        }

        negative = baseNegative;

        if (change > MAX_DELTA) {
            change = MAX_DELTA;
        }
    }

    function calculateNewRatingsWithGoals(
        uint256 ratingA,
        uint256 ratingB,
        uint8 goalsA,
        uint8 goalsB,
        uint256 kFactor
    ) internal pure returns (uint64 newRatingA, uint64 newRatingB) {
        (uint256 changeA, bool negativeA) = ratingChangeWithGoals(
            ratingA,
            ratingB,
            goalsA,
            goalsB,
            kFactor
        );

        (uint256 changeB, bool negativeB) = ratingChangeWithGoals(
            ratingB,
            ratingA,
            goalsB,
            goalsA,
            kFactor
        );

        if (negativeA) {
            newRatingA = uint64(ratingA - changeA);
        } else {
            newRatingA = uint64(ratingA + changeA);
        }

        if (negativeB) {
            newRatingB = uint64(ratingB - changeB);
        } else {
            newRatingB = uint64(ratingB + changeB);
        }
    }
}

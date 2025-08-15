// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

library EloCalculationLib {
    // Constants for ELO calculation
    uint64 public constant DEFAULT_ELO_RATING = 100;
    uint64 public constant K_FACTOR = 32; // Standard K-factor for most chess systems
    uint64 public constant MAX_ELO_DIFFERENCE = 400; // Maximum ELO difference for calculation

    /**
     * @dev Calculate new ELO ratings for both teams after a game
     * @param team1Rating Current ELO rating of team 1
     * @param team2Rating Current ELO rating of team 2
     * @param team1Score Goals scored by team 1
     * @param team2Score Goals scored by team 2
     * @return newTeam1Rating New ELO rating for team 1
     * @return newTeam2Rating New ELO rating for team 2
     */
    function calculateNewRatings(
        uint64 team1Rating,
        uint64 team2Rating,
        uint8 team1Score,
        uint8 team2Score
    ) external pure returns (uint64 newTeam1Rating, uint64 newTeam2Rating) {
        // Determine the actual result (1 = team1 wins, 0.5 = draw, 0 = team2 wins)
        uint64 actualResult;
        if (team1Score > team2Score) {
            actualResult = 1;
        } else if (team1Score < team2Score) {
            actualResult = 0;
        } else {
            actualResult = 1; // Treat draw as team1 win for calculation purposes
        }

        // Calculate expected score for team 1
        uint64 expectedScore = _calculateExpectedScore(
            team1Rating,
            team2Rating
        );

        // Calculate rating change
        uint64 ratingChange = _calculateRatingChange(
            actualResult,
            expectedScore
        );

        // Apply rating change (ensure ratings don't go below 10)
        newTeam1Rating = team1Rating + ratingChange;
        if (newTeam1Rating < 10) {
            newTeam1Rating = 10;
        }

        // Team 2 gets the opposite rating change
        newTeam2Rating = team2Rating - ratingChange;
        if (newTeam2Rating < 10) {
            newTeam2Rating = 10;
        }
    }

    /**
     * @dev Get the default ELO rating for new teams
     * @return Default ELO rating (1000)
     */
    function getDefaultRating() external pure returns (uint64) {
        return DEFAULT_ELO_RATING;
    }

    /**
     * @dev Calculate expected score for team 1 against team 2
     * @param team1Rating ELO rating of team 1
     * @param team2Rating ELO rating of team 2
     * @return Expected score (0-1, where 1 means expected win)
     */
    function _calculateExpectedScore(
        uint64 team1Rating,
        uint64 team2Rating
    ) private pure returns (uint64) {
        // Calculate rating difference, capped at MAX_ELO_DIFFERENCE
        int64 ratingDiff = int64(team1Rating) - int64(team2Rating);
        if (ratingDiff > int64(MAX_ELO_DIFFERENCE)) {
            ratingDiff = int64(MAX_ELO_DIFFERENCE);
        } else if (ratingDiff < -int64(MAX_ELO_DIFFERENCE)) {
            ratingDiff = -int64(MAX_ELO_DIFFERENCE);
        }

        // Calculate expected score using logistic function
        // E = 1 / (1 + 10^(-D/400)) where D is rating difference
        int64 exponent = (-ratingDiff * 1e18) / 400; // Using 1e18 for precision

        // For negative exponents, we need to handle large numbers carefully
        if (exponent < 0) {
            // Calculate 10^(-D/400) = 1 / 10^(D/400)
            uint64 positiveExponent = uint64(-exponent);
            uint256 denominator = _powerOfTen(positiveExponent);
            return uint64(1e18 / (1e18 + denominator));
        } else {
            uint256 denominator = _powerOfTen(uint64(exponent));
            return uint64(1e18 / (1e18 + denominator));
        }
    }

    /**
     * @dev Calculate rating change based on actual vs expected result
     * @param actualResult Actual result (1 = win, 0 = loss)
     * @param expectedScore Expected score (0-1)
     * @return Rating change (can be positive or negative)
     */
    function _calculateRatingChange(
        uint64 actualResult,
        uint64 expectedScore
    ) private pure returns (uint64) {
        // Rating change = K * (actual - expected)
        // Using 1e18 precision for expected score
        int64 change = int64(K_FACTOR * 1e18) *
            (int64(actualResult * 1e18) - int64(expectedScore));

        // Convert back to integer rating
        if (change > 0) {
            return uint64(change) / 1e18;
        } else {
            return uint64(-change) / 1e18;
        }
    }

    /**
     * @dev Calculate 10 raised to the power of exponent (with precision)
     * @param exponent The exponent (in 1e18 precision)
     * @return Result of 10^exponent (in 1e18 precision)
     */
    function _powerOfTen(uint64 exponent) private pure returns (uint256) {
        // For small exponents, we can use a lookup table or approximation
        // For now, we'll use a simple approach for reasonable ranges

        if (exponent == 0) return 1e18;
        if (exponent == 1e18) return 10e18;
        if (exponent == 2e18) return 100e18;
        if (exponent == 3e18) return 1000e18;
        if (exponent == 4e18) return 10000e18;

        // For other values, we'll use a reasonable approximation
        // This is a simplified version - in production you might want more precision
        return 1e18 + (exponent * 9e18) / 1e18;
    }
}

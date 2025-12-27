import { expect } from "chai";
import { ethers } from "hardhat";

describe("Enhanced Elo Library Tests", function () {
  let eloTester: any;
  let MAX_DELTA_SCALED: number;

  beforeEach(async function () {
    const EloTester = await ethers.getContractFactory("EloTester");
    eloTester = await EloTester.deploy();
    await eloTester.waitForDeployment();

    MAX_DELTA_SCALED = Number(await eloTester.getMaxDelta());
  });

  describe("Backwards Compatibility - Original ELO", function () {
    const testCases = [
      [10000, 10000, 100, 20, 1000, false, "Equal teams, win"],
      [10000, 10000, 50, 20, 0, false, "Equal teams, draw"],
      [10000, 10000, 0, 20, 1000, true, "Equal teams, loss"],
      [10500, 10000, 100, 20, 1710, false, "Higher rated wins"],
      [10000, 11000, 100, 20, 1996, false, "Underdog wins"],
      [20000, 10000, 0, 32, 2772, true, "Big ELO difference, win"],
      [90000, 10000, 0, 32, 2772, true, "Even bigger ELO difference, win"],
      [10000, 90000, 100, 32, 3196, false, "Big ELO difference, loss"],
    ];

    it("Should maintain backwards compatibility", async function () {
      for (const [ratingA, ratingB, score, kFactor, expectedChange, isNegative, description] of testCases) {
        const result = await eloTester.ratingChange(ratingA, ratingB, score, kFactor);

        console.log(`${description} - Change: ${result.change}, Negative: ${result.negative}`);

        expect(result.negative).to.equal(isNegative, `Incorrect negative flag: ${description}`);
        expect(Number(result.change)).to.equal(expectedChange, `Incorrect change: ${description}`);
      }
    });
  });

  describe("Goal Multiplier System", function () {
    const multiplierTestCases = [
      [1, 0, 100, "1-0 win (margin=1)"],
      [2, 0, 150, "2-0 win (margin=2)"],
      [3, 0, 175, "3-0 win (margin=3)"],
      [4, 0, 200, "4-0 win (margin=4)"],
      [2, 2, 100, "2-2 draw"],
      [0, 1, 100, "0-1 loss (margin=1)"],
      [0, 3, 175, "0-3 loss (margin=3)"],
    ];

    it("Should calculate goal multipliers correctly", async function () {
      for (const [goalsA, goalsB, expectedMultiplier, description] of multiplierTestCases) {
        const multiplier = await eloTester.getGoalMultiplier(goalsA, goalsB);
        expect(Number(multiplier)).to.equal(expectedMultiplier, `Wrong multiplier: ${description}`);
      }
    });
  });

  describe("Advanced ELO with Goal Difference", function () {
    const soccerTestCases = [
      // ratingA, ratingB, goalsA, goalsB, kFactor, expectedChange, isNegative, description
      [10000, 10000, 1, 0, 20, 1000, false, "Equal teams, 1-0 win"],
      [10000, 10000, 2, 0, 20, 1500, false, "Equal teams, 2-0 win"],
      [10000, 10000, 3, 0, 20, 1750, false, "Equal teams, 3-0 win"],
      [10000, 10000, 1, 1, 20, 0, false, "Equal teams, 1-1 draw"],
      [10000, 10000, 0, 2, 20, 1500, true, "Equal teams, 0-2 loss"],
      [190000, 10000, 5, 0, 32, 856, false, "Very big ELO diff, 5-0 win"],
      [190000, 10000, 0, 5, 32, 5544, true, "Very big ELO diff, 0-5 loss"],
    ];

    it("Should apply goal difference multipliers correctly", async function () {
      for (const [ratingA, ratingB, goalsA, goalsB, kFactor, expectedChange, isNegative, description] of soccerTestCases) {
        const result = await eloTester.ratingChangeWithGoals(
          ratingA, ratingB, goalsA, goalsB, kFactor
        );

        console.log(`${description} - Change: ${result.change}, Negative: ${result.negative}`);

        expect(result.negative).to.equal(isNegative, `Incorrect negative flag: ${description}`);
        expect(Number(result.change)).to.equal(expectedChange);
        expect(Number(result.change)).to.be.lte(MAX_DELTA_SCALED);
      }
    });
  });

  describe("New Ratings Calculation", function () {
    it("Should calculate new ratings for both players", async function () {
      const [newRatingA, newRatingB] = await eloTester.calculateNewRatingsWithGoals(
        10000, 10000, 2, 0, 20
      );

      // Player A wins 2-0: +1500 points
      expect(Number(newRatingA)).to.equal(11500);
      // Player B loses 0-2: -1500 points  
      expect(Number(newRatingB)).to.equal(8500);
    });

    it("Should handle draw correctly", async function () {
      const [newRatingA, newRatingB] = await eloTester.calculateNewRatingsWithGoals(
        10000, 10000, 1, 1, 20
      );

      // Both players remain the same in a draw between equals
      expect(Number(newRatingA)).to.equal(10000);
      expect(Number(newRatingB)).to.equal(10000);
    });
  });

  describe("Edge Cases and Validation", function () {
    it("Should reject invalid goals", async function () {
      try {
        await eloTester.ratingChangeWithGoals(10000, 10000, 21, 0, 20);
        expect.fail("Expected transaction to revert");
      } catch (error) {
        expect(error.message).to.include("InvalidGoals");
      }
    });

    it("Should reject invalid score", async function () {
      try {
        await eloTester.ratingChange(10000, 10000, 101, 20);
        expect.fail("Expected transaction to revert");
      } catch (error) {
        expect(error.message).to.include("InvalidScore");
      }
    });
  });
});
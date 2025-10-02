import { expect } from "chai";
import { ethers } from "hardhat";

describe("ELO Library Tests", function () {
    let eloTester: any;
    let MAX_DELTA_SCALED: number;

    beforeEach(async function () {
        const EloTester = await ethers.getContractFactory("EloTester");
        eloTester = await EloTester.deploy();
        await eloTester.waitForDeployment();

        // Fetch MAX_DELTA from the contract for dynamic testing
        MAX_DELTA_SCALED = Number(await eloTester.getMaxDelta());
    });

    describe("ELO Rating Calculations", function () {
        const testCases = [
            // team1Elo, team2Elo, score, kFactor, expectedChange, isNegative, description
            [10000, 10000, 100, 20, 1000, false, "Equal teams, win"], // kFactor * 50 = 20 * 50 = 1000
            [10000, 10000, 50, 20, 0, false, "Equal teams, draw"], // 0 for draw
            [10000, 10000, 0, 20, 1000, true, "Equal teams, loss"], // kFactor * 50 = 20 * 50 = 1000 (negative)
            [10500, 10000, 100, 20, 1710, false, "Higher rated wins"],
            [10000, 11000, 100, 20, 1996, false, "Underdog wins"],
            [10000, 20000, 100, 20, 1998, false, "Large diff, underdog wins"],
            [20000, 10000, 0, 20, 1732, true, "Large diff, favorite loses"],
            [15000, 14500, 100, 20, 1710, false, "Small diff, higher rated wins"],
            // Add the special case with kFactor 32
            [20000, 10000, 0, 32, 31, true, "Special case with kFactor 32"],
        ];

        it("Should calculate ELO changes correctly for various scenarios", async function () {
            for (const [
                team1Elo,
                team2Elo,
                score,
                kFactor,
                expectedChange,
                isNegative,
                description,
            ] of testCases) {
                const result = await eloTester.ratingChange(
                    team1Elo,
                    team2Elo,
                    score,
                    kFactor
                );

                console.log(
                    `${description} - Change: ${result.change}, Negative: ${result.negative}`
                );

                expect(result.negative).to.equal(
                    isNegative,
                    `Incorrect negative flag for case: ${description}`
                );

                expect(Number(result.change)).to.equal(
                    expectedChange,
                    `Incorrect change amount for case: ${description}`
                );

                // Verify MAX_DELTA cap is respected
                expect(Number(result.change)).to.be.lte(
                    MAX_DELTA_SCALED,
                    `Change exceeds MAX_DELTA for case: ${description}`
                );
            }
        });
    });

    describe("K-Factor Tests", function () {
        const kFactorTestCases = [
            // team1Elo, team2Elo, score, kFactor, expectedChange, isNegative
            [10000, 10000, 100, 10, 500, false],    // 10 * 50 = 500
            [10000, 10000, 100, 20, 1000, false],   // 20 * 50 = 1000
            [10000, 10000, 100, 32, 1600, false],   // 32 * 50 = 1600
            [10000, 10000, 100, 40, 2000, false],   // 40 * 50 = 2000
        ];

        it("Should calculate correctly with different K factors", async function () {
            for (const [
                team1Elo,
                team2Elo,
                score,
                kFactor,
                expectedChange,
                isNegative,
            ] of kFactorTestCases) {
                const result = await eloTester.ratingChange(
                    team1Elo,
                    team2Elo,
                    score,
                    kFactor
                );

                console.log(
                    `K=${kFactor} - Change: ${result.change}, Negative: ${result.negative}`
                );

                expect(result.negative).to.equal(isNegative);
                expect(Number(result.change)).to.equal(expectedChange);
            }
        });
    });

    describe("Edge Cases and Validation", function () {
        it("Should reject score values above 100", async function () {
            // Use a standard try-catch approach instead of revertedWithCustomError
            try {
                await eloTester.ratingChange(10000, 10000, 101, 20);
                expect.fail("Expected transaction to revert");
            } catch (error) {
                // Check that the error message contains "InvalidScore"
                expect(error.message).to.include("InvalidScore");
            }
        });

        it("Should handle extreme rating differences", async function () {
            const result = await eloTester.ratingChange(1000, 30000, 100, 20);
            expect(Number(result.change)).to.equal(1998);
            expect(result.negative).to.be.false;
        });

        it("Should handle the special case with kFactor 32", async function () {
            const result = await eloTester.ratingChange(20000, 10000, 0, 32);
            expect(Number(result.change)).to.equal(31);
            expect(result.negative).to.be.true;
        });
    });
});
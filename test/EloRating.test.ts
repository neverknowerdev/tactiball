import { expect } from "chai";
import { ethers } from "hardhat";

describe("ELO Library Tests (with Delta Caps)", function () {
    let eloTester: any;
    let MAX_DELTA_SCALED: number;

    beforeEach(async function () {
        const EloTester = await ethers.getContractFactory("EloTester");
        eloTester = await EloTester.deploy();
        await eloTester.deployed();

        // Fetch MAX_DELTA from the contract for dynamic testing
        MAX_DELTA_SCALED = (await eloTester.getMaxDelta()).toNumber();
    });

    describe("Bug Fix Verification", function () {
        it("Should work with scaled ratings (15000 vs 14500)", async function () {
            const result = await eloTester.ratingChange(15000, 14500, 100, 32);

            console.log("Bug fix - Change:", result.change.toString());
            console.log("Bug fix - Negative:", result.negative);

            expect(result.change).to.be.gt(0);
            expect(result.negative).to.be.false;
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });
    });

    describe("Basic Calculations", function () {
        it("Equal teams, win", async function () {
            const result = await eloTester.ratingChange(10000, 10000, 100, 20);
            console.log("Equal win - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.false;
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });

        it("Equal teams, draw", async function () {
            const result = await eloTester.ratingChange(10000, 10000, 50, 20);
            console.log("Equal draw - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.change).to.be.lt(1100); // Draw should give small change (around 990)
            expect(result.negative).to.be.false; // Draw means no change in sign for A if expected is 50
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });

        it("Equal teams, loss", async function () {
            const result = await eloTester.ratingChange(10000, 10000, 0, 20);
            console.log("Equal loss - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.true;
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });

        it("Higher rated wins", async function () {
            const result = await eloTester.ratingChange(10500, 10000, 100, 20);
            console.log("Favorite wins - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.false;
            expect(result.change).to.be.lt(2000); // With small rating diff, still gains decent points
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });

        it("Underdog wins", async function () {
            const result = await eloTester.ratingChange(10000, 11000, 100, 20);
            console.log("Underdog wins - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.false;
            expect(result.change).to.be.gt(1000);
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });
    });

    describe("Delta Capping Behavior", function () {
        it("Should cap change to MAX_DELTA when rating difference is very large and underdog wins", async function () {
            // Player A is much lower rated, but wins. Expected change would be very high.
            const result = await eloTester.ratingChange(10000, 20000, 100, 32);
            console.log("Large diff underdog win - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.false;
            expect(result.change).to.equal(MAX_DELTA_SCALED);
        });

        it("Should NOT cap change to MAX_DELTA when rating difference is very large and favorite loses", async function () {
            // Player A is much higher rated, but loses. Expected change should be small.
            const result = await eloTester.ratingChange(20000, 10000, 0, 32);
            console.log("Large diff favorite loss - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.true;
            expect(result.change).to.equal(31); // Specific expected value
        });

        it("Should handle large rating differences without reverting, even if not capped", async function () {
            // A rating difference that previously reverted, but now should calculate a value
            // (might be capped, might not, depending on MAX_DELTA)
            const result = await eloTester.ratingChange(10000, 15000, 100, 32);
            console.log("Medium-large diff - Change:", result.change.toString(), "Negative:", result.negative);
            expect(result.negative).to.be.false;
            expect(result.change).to.be.gt(0); // Should be a valid calculation, possibly capped
            expect(result.change).to.be.lte(MAX_DELTA_SCALED);
        });

        it("Should reject invalid score (still needs to be 0, 50, or 100)", async function () {
            await expect(eloTester.ratingChange(10000, 10000, 101, 20)).to.be.revertedWith(
                "Elo: Invalid score (must be 0, 50, or 100)"
            );
        });

        it("Should not cap if change is below MAX_DELTA", async function () {
            // Use a scenario where the calculated change is normally less than MAX_DELTA
            const result = await eloTester.ratingChange(10000, 10000, 100, 20); // Expected ~1990
            console.log("Below MAX_DELTA - Change:", result.change.toString());
            expect(result.change).to.equal(1990); // Should be exact, not capped
            expect(result.change).to.be.lt(MAX_DELTA_SCALED);
        });
    });
});
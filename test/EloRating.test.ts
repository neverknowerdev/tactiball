import { expect } from "chai";
import { ethers } from "hardhat";

describe("ELO Library Tests", function () {
    let elo: any;

    beforeEach(async function () {
        const Elo = await ethers.getContractFactory("Elo");
        elo = await Elo.deploy();
        await elo.waitForDeployment();
    });

    describe("Bug Fix Verification", function () {
        it("Should work with scaled ratings (15000 vs 14500) - Bug scenario", async function () {
            // This was failing before with the old implementation
            const result = await elo.ratingChange(15000, 14500, 100, 32);
            
            console.log("Change:", result[0].toString());
            console.log("Negative:", result[1]);
            
            expect(result[0]).to.be.greaterThan(0);
            expect(result[1]).to.be.false; // Higher rated team wins, gains points
        });
    });

    describe("Basic Calculations", function () {
        it("Equal teams, win", async function () {
            const result = await elo.ratingChange(10000, 10000, 100, 20);
            console.log("Equal win - Change:", result[0].toString(), "Negative:", result[1]);
            expect(result[1]).to.be.false;
        });

        it("Equal teams, draw", async function () {
            const result = await elo.ratingChange(10000, 10000, 50, 20);
            console.log("Equal draw - Change:", result[0].toString(), "Negative:", result[1]);
            expect(result[0]).to.be.lessThan(100); // Near zero change
        });

        it("Equal teams, loss", async function () {
            const result = await elo.ratingChange(10000, 10000, 0, 20);
            console.log("Equal loss - Change:", result[0].toString(), "Negative:", result[1]);
            expect(result[1]).to.be.true;
        });

        it("Higher rated wins", async function () {
            const result = await elo.ratingChange(11000, 10000, 100, 20);
            console.log("Favorite wins - Change:", result[0].toString(), "Negative:", result[1]);
            expect(result[1]).to.be.false;
            expect(result[0]).to.be.lessThan(1000); // Less than 10 points
        });

        it("Underdog wins", async function () {
            const result = await elo.ratingChange(10000, 11000, 100, 20);
            console.log("Underdog wins - Change:", result[0].toString(), "Negative:", result[1]);
            expect(result[1]).to.be.false;
            expect(result[0]).to.be.greaterThan(1000); // More than 10 points
        });
    });

    describe("Edge Cases", function () {
        it("Should revert with rating difference >= 1126", async function () {
            await expect(
                elo.ratingChange(20000, 10000, 100, 20)
            ).to.be.revertedWithCustomError(elo, "RatingDifferenceTooLarge");
        });

        it("Should reject invalid score", async function () {
            await expect(
                elo.ratingChange(10000, 10000, 101, 20)
            ).to.be.reverted;
        });
    });
});
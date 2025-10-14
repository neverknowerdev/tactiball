# GitHub Actions Workflows

# This directory contains GitHub Actions workflows for automated testing and CI/CD.

## Workflow

### Tests & CI/CD (`test.yml`)
- **Triggers**: Pull requests to any branch (opened, synchronize, reopened)
- **Job**: `Run Tests` - Runs Hardhat tests, linting, and generates coverage reports
- **Purpose**: Prevents merging PRs with failing tests when set as required status check

## Setting Up Required Status Checks

To prevent PRs from being merged if tests fail:

1. Go to your GitHub repository
2. Navigate to **Settings** → **Branches**
3. Click **Add rule** or edit existing branch protection rule
4. Set **Branch name pattern** to `main` (and `develop` if you want)
5. Enable these options:
   - ✅ **Require status checks to pass before merging**
   - ✅ **Require branches to be up to date before merging**
6. In the status checks section, add: `Run Tests`
7. Click **Create** or **Save changes**

**Result**: PRs cannot be merged until the "Run Tests" check passes! 🚫❌

## Test Commands

The workflows use the following test commands:

- **Main project**: `yarn test` (runs all Hardhat tests)
- **Coverage**: `yarn test:coverage` (generates test coverage)
- **Linting**: `yarn lint` (runs ESLint)

## Environment Variables

The workflows use mock environment variables for testing to avoid requiring real API keys in CI/CD.

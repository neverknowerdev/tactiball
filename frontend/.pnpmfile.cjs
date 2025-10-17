// .pnpmfile.cjs
// This file allows you to customize how pnpm installs packages

module.exports = {
    hooks: {
        readPackage(pkg) {
            // You can modify package.json here if needed
            return pkg;
        }
    }
};

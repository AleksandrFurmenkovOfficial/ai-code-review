const { execSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

try {
    console.log("Checking for package dependencies...");
    const pkgLockPath = path.resolve(__dirname, "package-lock.json");
    const pkgJsonPath = path.resolve(__dirname, "package.json");
    
    if (!existsSync(pkgJsonPath)) {
        throw new Error("package.json not found!");
    }
    
    if (!existsSync(pkgLockPath)) {
        console.log("Warning: package-lock.json not found. For better security, consider using a lockfile.");
    }
    
    console.log("Running npm ci or npm install...");
    
    if (existsSync(pkgLockPath)) {
        execSync("npm ci --no-audit --no-fund --production", {
            cwd: path.resolve(__dirname),
            stdio: 'inherit'
        });
    } else {
        execSync("npm install --no-audit --no-fund --production --no-package-lock", {
            cwd: path.resolve(__dirname),
            stdio: 'inherit'
        });
    }
    
    console.log("Dependencies installed successfully.");
} catch (error) {
    console.error("Error installing dependencies:", error.message);
    process.exit(1);
}
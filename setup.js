/**
 * Setup script for AI Code Review GitHub Action
 * Installs package dependencies with proper error handling and security considerations
 */

const { execSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

/**
 * Checks if the current Node.js version meets minimum requirements
 * @returns {boolean} true if version is compatible
 */
function checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
    
    if (majorVersion < 20) {
        console.warn(`Warning: Node.js ${nodeVersion} detected. Consider upgrading to Node.js 20+ for better compatibility.`);
        return false;
    }
    
    console.log(`Node.js ${nodeVersion} detected - compatible.`);
    return true;
}

/**
 * Executes npm command with proper error handling
 * @param {string} command - npm command to execute
 */
function executeNpmCommand(command) {
    try {
        console.log(`Executing: ${command}`);
        execSync(command, {
            cwd: path.resolve(__dirname),
            stdio: 'inherit'
        });
    } catch (error) {
        throw new Error(`Failed to execute npm command: ${command}\nError: ${error.message}`);
    }
}

try {
    console.log("Checking for package dependencies...");
    
    // Check Node.js version compatibility
    checkNodeVersion();
    
    const pkgLockPath = path.resolve(__dirname, "package-lock.json");
    const pkgJsonPath = path.resolve(__dirname, "package.json");
    if (!existsSync(pkgJsonPath)) {
        throw new Error("package.json not found! Make sure you're running this script from the project root directory.");
    }
    
    if (!existsSync(pkgLockPath)) {
        console.log("Warning: package-lock.json not found. For better security and reproducible builds, consider using a lockfile.");
    }
    
    console.log("Installing dependencies...");
      // Use npm ci for production builds when lockfile exists (faster and more reliable)
    // Use npm install when no lockfile is present
    if (existsSync(pkgLockPath)) {
        executeNpmCommand("npm ci --omit=dev --no-audit --no-fund");
    } else {
        executeNpmCommand("npm install --omit=dev --no-audit --no-fund --no-package-lock");
    }
    
    console.log("Dependencies installed successfully.");
    
} catch (error) {
    console.error("Error installing dependencies:", error.message);
    
    // Provide helpful debugging information
    console.error("\n Troubleshooting tips:");
    console.error("- Ensure you have Node.js 16+ installed");
    console.error("- Check your internet connection");
    console.error("- Verify package.json is valid JSON");
    console.error("- Try running 'npm cache clean --force' if issues persist");
    
    process.exit(1);
}

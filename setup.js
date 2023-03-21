const { execFileSync } = require("child_process");
const path = require("path");

try {
  console.log("Running npm install...");
  let args = ["install", "--prefix", path.resolve(__dirname)];
  execFileSync("npm", args);
  console.log("Dependencies installed successfully.");
} catch (error) {
  console.error("Error installing dependencies:", error);
  process.exit(1);
}

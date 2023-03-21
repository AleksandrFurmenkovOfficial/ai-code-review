const { execSync } = require("child_process");
const path = require("path");

const actionDir = path.resolve(__dirname);

try {
  console.log("Running npm install...");
  execSync(`npm install --prefix ${actionDir}`, { stdio: "inherit" });
  console.log("Dependencies installed successfully.");
} catch (error) {
  console.error("Error installing dependencies:", error);
  process.exit(1);
}

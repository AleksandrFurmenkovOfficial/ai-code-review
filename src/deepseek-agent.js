const { warning, info } = require("@actions/core");
const BaseAIAgent = require("./base-ai-agent");

class DeepseekAgent extends BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, failAction = false) {
        super(apiKey, fileContentGetter, fileCommentator, model, failAction);
        this.apiBase = "https://api.deepseek.com";
    }

    async initialize() {
        info("Initializing Deepseek AI agent");
        return true;
    }

    async doReview(changedFiles) {
        let reviewSummary = '';
        const simpleChangedFiles = changedFiles.map(file => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            patch: file.patch
        }));
        
        warning("Deepseek AI provider is not fully implemented yet. This is a placeholder implementation.");
        info(`Would have processed ${changedFiles.length} changed files with Deepseek AI.`);
        
        reviewSummary = "Deepseek AI review functionality will be implemented in a future version.";
        
        return reviewSummary;
    }
}

module.exports = DeepseekAgent;

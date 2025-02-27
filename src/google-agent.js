const { warning, info } = require("@actions/core");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const BaseAIAgent = require("./base-ai-agent");

class GoogleAgent extends BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, failAction = false) {
        super(apiKey, fileContentGetter, fileCommentator, model, failAction);
        this.genAI = new GoogleGenerativeAI(apiKey);
    }

    async initialize() {
        try {
            this.model = this.genAI.getGenerativeModel({ 
                model: this.model,
                systemInstruction: `You are an expert AI code reviewer responsible for reviewing GitHub PRs.
                Review the user's changes for typos, logical errors, and security issues.
                Use the provided tools to add specific, actionable comments.
                Avoid repeating the same issue multiple times.
                Comment only when you are confident! Do not report minor issues.
                Use 'getFileContent' when you need more context.
                Provide results only via the provided functions.`
            });
            return true;
        } catch (error) {
            this.handleError(error, 'Error initializing Google AI model');
            return false;
        }
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
        
        try {
            await this.initialize();
            
            const maxRetries = 3;
            const initialBackoff = 1000;
            
            for (let retries = 0; retries < maxRetries; retries++) {
                try {
                    reviewSummary = await this.processReview(simpleChangedFiles);
                    break;
                } catch (error) {
                    if (retries >= maxRetries - 1) {
                        this.handleError(error, 'Max retries reached for code review');
                    }
                    
                    const backoff = initialBackoff * Math.pow(2, retries) + Math.random() * 1000;
                    warning(`Retry ${retries + 1}/${maxRetries}: ${error.message}. Retrying in ${Math.round(backoff)}ms`);
                    await new Promise(resolve => setTimeout(resolve, backoff));
                }
            }
        } catch (error) {
            this.handleError(error, 'Error in code review process', false);
        }
        
        return reviewSummary;
    }

    async processReview(changedFiles) {
        warning("Google AI provider is not fully implemented yet. This is a placeholder implementation.");
        info("Processing changed files with Google AI...");
        
        let reviewedFiles = 0;
        let commentsMade = 0;
        
        return `Code review with Google AI completed. This is currently a placeholder implementation. Full support for Google AI will be added in future versions.`;
    }
}

module.exports = GoogleAgent;

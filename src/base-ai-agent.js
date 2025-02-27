class BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        this.apiKey = apiKey;
        this.fileContentGetter = fileContentGetter;
        this.fileCommentator = fileCommentator;
        this.model = model;
        this.fileCache = new Map();
        this.cacheLock = false;
    }

    getSystemPrompt() {
        return `You are an expert code reviewer analyzing a GitHub pull request as part of an automated CI pipeline. You must work independently without human interaction. Review for logical errors, bugs, and security issues.

Focus on:
- Real bugs and logic errors (high priority)
- Security vulnerabilities (high priority)
- Typos

Skip and do not comment on (but you can mention these in the summary):
- Formatting and code style preferences (the lowest priority)
- Performance issues
- Code maintainability issues
- Best practices

For each issue found, use the get_file_content tool to retrieve additional context if needed, and the add_review_comment tool to add specific, actionable comments to the code.

The "changedFiles" object contains information about files that were modified in the PR, including:
- filename: The path to the changed file
- status: The change status (added, modified, etc.)
- patch: The diff showing what was changed
- additions: The number of added lines
- deletions: The number of deleted lines

You MUST use the get_file_content tool to examine files for a thorough review. Always examine the content you receive and make determinations based on that content.

When complete, call the mark_as_done tool with a brief summary of the review. The summary should ONLY include:
- A concise overview of what was changed in the code
- The overall quality assessment of the changes
- Any patterns or recurring issues observed
- DO NOT ask questions or request more information in the summary
- DO NOT mention "I couldn't see the changes" - use the tools to retrieve any content you need

Lines are 1-indexed. Do not comment on trivial issues or style preferences.
Be concise but thorough in your review.
=> MODE NO-FALSE-POSITIVES IS ON.`;
    }

    handleError(error, message, throwError = true) {
        console.error(`${message}: ${error.message}`);
        if (throwError) {
            throw new Error(`${message}: ${error.message}`);
        }
    }

    async getFileContentWithCache(pathToFile, startLineNumber, endLineNumber) {
        try {
            const acquireLock = async () => {
                const timeout = 5000; // 5 seconds
                const start = Date.now();
                while (this.cacheLock) {
                    if (Date.now() - start > timeout) {
                        throw new Error("Timeout while waiting for cache lock");
                    }
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
                this.cacheLock = true;
            };
            
            const releaseLock = () => {
                this.cacheLock = false;
            };
            
            await acquireLock();
            let content;
            
            try {
                if (!this.fileCache.has(pathToFile)) {
                    releaseLock();
                    content = await this.fileContentGetter(pathToFile);
                    await acquireLock();
                    this.fileCache.set(pathToFile, content);
                } else {
                    content = this.fileCache.get(pathToFile);
                }
            } finally {
                releaseLock();
            }
            
            const span = 20;
            const lines = content.split('\n');
            const startIndex = Math.max(0, startLineNumber - 1 - span);
            const endIndex = Math.min(lines.length, endLineNumber + span);
            const selectedLines = lines.slice(startIndex, endIndex);
            return `\`\`\`${pathToFile}\n${selectedLines.join('\n')}\n\`\`\``;
        } catch (error) {
            if (this.cacheLock) {
                this.cacheLock = false;
            }
            this.handleError(error, 'Error getting file content', true);
            return `Error getting file content: ${error.message}`;
        }
    }

    validateLineNumbers(startLineNumber, endLineNumber) {
        if (!Number.isInteger(startLineNumber) || startLineNumber < 1) {
            return "Error: Start line number must be a positive integer";
        }
        if (!Number.isInteger(endLineNumber) || endLineNumber < 1) {
            return "Error: End line number must be a positive integer";
        }
        if (startLineNumber > endLineNumber) {
            return "Error: Start line number cannot be greater than end line number";
        }
        return null;
    }

    async addReviewComment(fileName, startLineNumber, endLineNumber, foundErrorDescription, side = "RIGHT") {
        try {
            const validationError = this.validateLineNumbers(startLineNumber, endLineNumber);
            if (validationError) {
                this.handleError(new Error(validationError), 'Validation error', true);
                return validationError;
            }
            
            await this.fileCommentator(foundErrorDescription, fileName, side, startLineNumber, endLineNumber);
            return "Success! The review comment has been published.";
        } catch (error) {
            this.handleError(error, 'Error creating review comment', true);
            return `Error! Please ensure that the lines you specify for the comment are part of the DIFF! Error message: ${error.message}`;
        }
    }

    async doReview(changedFiles) {
        throw new Error("Method 'doReview' must be implemented by subclass");
    }

    async initialize() {
        throw new Error("Method 'initialize' must be implemented by subclass");
    }
}

module.exports = BaseAIAgent;

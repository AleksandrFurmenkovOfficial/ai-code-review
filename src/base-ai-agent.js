const core = require("./core-wrapper");
const constants = require("./constants");

class SimpleMutex {
    constructor() {
        this._locked = false;
        this._waiting = [];
    }
    acquire(timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Timeout while waiting for cache lock")), timeoutMs);
            const grant = () => {
                clearTimeout(timer);
                resolve();
            };
            if (!this._locked) {
                this._locked = true;
                grant();
            } else {
                this._waiting.push(grant);
            }
        });
    }
    release() {
        if (this._waiting.length) {
            const next = this._waiting.shift();
            next();
        } else {
            this._locked = false;
        }
    }
}

class BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent) {
        this.apiKey = apiKey;
        this.fileContentGetter = fileContentGetter;
        this.fileCommentator = fileCommentator;
        this.model = model;
        this.reviewRulesContent = reviewRulesContent;
        this.fileCache = new Map();
        this.cacheMutex = new SimpleMutex();
        this.MAX_CACHE_ENTRIES = constants.MAX_CACHE_ENTRIES;
    }

    getSystemPrompt() {
        let prompt = `You are an expert code reviewer analyzing a GitHub pull request as part of an automated CI pipeline. You must work independently without human interaction. Review for logical errors, bugs, and security issues.

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

        if (this.reviewRulesContent) {
            prompt += `\n\nAdditionally, adhere to the following custom review rules:\n${this.reviewRulesContent}`;
        }

        return prompt;
    }

    handleError(error, message, throwError = true) {
        const fullMessage = `${message}: ${error.message}`;
        console.error(fullMessage);
        if (throwError) {
            throw new Error(fullMessage);
        }
    }

    async getFileContentWithCache(pathToFile, startLineNumber, endLineNumber) {
        if (!pathToFile || typeof pathToFile !== "string") {
            throw new Error("Invalid file path provided");
        }
        if (
            !Number.isInteger(startLineNumber) ||
            !Number.isInteger(endLineNumber) ||
            startLineNumber < 1 ||
            endLineNumber < 1 ||
            startLineNumber > endLineNumber
        ) {
            throw new Error("Invalid line numbers provided");
        }
        try {
            await this.cacheMutex.acquire();
            let content;
            try {
                const cacheKey = `${pathToFile}`;
                if (this.fileCache.has(cacheKey)) {
                    content = this.fileCache.get(cacheKey);
                } else {
                    core.info(`Fetching content for file: ${pathToFile}`);
                    content = await this.fileContentGetter(pathToFile);
                    if (typeof content !== "string") {
                        throw new Error(`Invalid content type received for ${pathToFile}`);
                    }
                    this.fileCache.set(cacheKey, content);
                    if (this.fileCache.size > this.MAX_CACHE_ENTRIES) {
                        const oldestKey = this.fileCache.keys().next().value;
                        this.fileCache.delete(oldestKey);
                    }
                }
            } finally {
                this.cacheMutex.release();
            }

            const span = Number.isInteger(constants.LINE_SPAN) && constants.LINE_SPAN >= 0 ? constants.LINE_SPAN : 3;
            const lines = content.split(/\r?\n/);
            const startIndex = Math.max(0, startLineNumber - 1 - span);
            const endIndex = Math.min(lines.length, endLineNumber + span);
            const selectedLines = lines.slice(startIndex, endIndex);
            const width = Math.max(4, String(lines.length).length);
            const numberedLines = selectedLines.map((line, index) => {
                const lineNumber = startIndex + index + 1;
                return `${lineNumber.toString().padStart(width, " ")}: ${line}`;
            });
            const escapedPath = pathToFile.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
            return `\`\`\`${escapedPath}\n${numberedLines.join("\n")}\n\`\`\``;
        } catch (error) {
            const errMsg = `Error getting file content for ${pathToFile}: ${error.message}`;
            core.error(errMsg);
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
        const validationError = this.validateLineNumbers(startLineNumber, endLineNumber);
        if (validationError) {
            this.handleError(new Error(validationError), "Validation error", false);
            return validationError;
        }
        try {
            await this.fileCommentator(foundErrorDescription, fileName, side, startLineNumber, endLineNumber);
            return "Success! The review comment has been published.";
        } catch (error) {
            this.handleError(error, "Error creating review comment", false);
            return `Error! Please ensure that the lines you specify for the comment are part of the DIFF! Error message: ${error.message}`;
        }
    }

    doReview(_changedFiles) {
        throw new Error("Method 'doReview' must be implemented by subclass");
    }

    initialize() {
        throw new Error("Method 'initialize' must be implemented by subclass");
    }
}

module.exports = BaseAIAgent;

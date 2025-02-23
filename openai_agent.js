const { warning, info } = require("@actions/core");
const { OpenAI } = require('openai');

class OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        this.openai = new OpenAI({ apiKey });
        this.fileContentGetter = fileContentGetter;
        this.fileCommentator = fileCommentator;
        this.fileCache = {};
        this.model = model;
    }

    handleError(error, message, throwError = true) {
        warning(`${message}: ${error.message}\n${error.stack}`);
        if (throwError) {
            throw new Error(`${message}: ${error.message}`);
        }
    }

    async initCodeReviewAssistant() {
        try {
            this.assistant = await this.openai.beta.assistants.create({
                name: "AI Code Reviewer",
                instructions:
                    "You are an expert AI code reviewer responsible for reviewing GitHub PRs.\n" +
                    "Review the user's changes for typos, real LOGICAL ERRORS, and CRITICAL security ISSUES.\n" +
                    "Use the 'addReviewCommentToFileLine' tool to add specific, actionable comments.\n" +
                    "Avoid repeating the same issue multiple times.\n" +
                    "Comment only when you are at least 99% confident! Do not report Consider/Ensure etc, only REAL issues!\n" +
                    "Use 'getFileContent' when you need more context.\n" +
                    "Line numbers start from 1. Provide results only via the provided functions.",
                tools: [
                    {
                        type: "function",
                        function: {
                            name: "getFileContent",
                            description: "Retrieves file content for context",
                            parameters: {
                                type: "object",
                                properties: {
                                    pathToFile: {
                                        type: "string",
                                        description: "The fully qualified path to the file."
                                    },
                                    startLineNumber: {
                                        type: "integer",
                                        description: "The starting line number."
                                    },
                                    endLineNumber: {
                                        type: "integer",
                                        description: "The ending line number."
                                    }
                                },
                                required: ["pathToFile", "startLineNumber", "endLineNumber"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "addReviewCommentToFileLine",
                            description: "Adds a review comment to a SPECIFIC RANGE OF LINES in the pull request DIFF",
                            parameters: {
                                type: "object",
                                properties: {
                                    fileName: {
                                        type: "string",
                                        description: "The relative path to the file that necessitates a comment"
                                    },
                                    startLineNumber: {
                                        type: "integer",
                                        description: "The starting line number of the range. Start line must precede the end line."
                                    },
                                    endLineNumber: {
                                        type: "integer",
                                        description: "The ending line number of the range. For multi-line comments, this is the last line."
                                    },
                                    foundErrorDescription: {
                                        type: "string",
                                        description: "The review comment content"
                                    },
                                    side: {
                                        type: "string",
                                        description: "The side of the diff that the changes appear on (LEFT or RIGHT).",
                                        enum: ["LEFT", "RIGHT"],
                                        default: "RIGHT"
                                    }
                                },
                                required: ["fileName", "startLineNumber", "endLineNumber", "foundErrorDescription"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "markAsDone",
                            description: "Marks the code review as completed and provides a brief summary of changes.",
                            parameters: {
                                type: "object",
                                properties: {
                                    briefSummary: {
                                        type: "string",
                                        description: "A brief summary of changes made in the PR."
                                    }
                                },
                                required: ["briefSummary"]
                            }
                        }
                    }
                ],
                model: this.model
            });
        } catch (error) {
            this.handleError(error, 'Error initializing code review assistant');
        }
    }

    async getFileContent(args) {
        const { pathToFile, startLineNumber, endLineNumber } = args;
        try {
            if (!(pathToFile in this.fileCache)) {
                this.fileCache[pathToFile] = await this.fileContentGetter(pathToFile);
            }
            const content = this.fileCache[pathToFile];
            const span = 20;
            const lines = content.split('\n');
            const startIndex = Math.max(0, startLineNumber - 1 - span);
            const endIndex = Math.min(lines.length, endLineNumber + span);
            const selectedLines = lines.slice(startIndex, endIndex);
            return `\`\`\`${pathToFile}\n${selectedLines.join('\n')}\n\`\`\``;
        } catch (error) {
            this.handleError(error, 'Error getting file content', false);
            return `Error getting file content: ${error.message}`;
        }
    }

    async addReviewCommentToFileLine(args) {
        const { fileName, startLineNumber, endLineNumber, foundErrorDescription, side = "RIGHT" } = args;
        try {
            await this.fileCommentator(foundErrorDescription, fileName, side, startLineNumber, endLineNumber);
            return "Success! The review comment has been published.";
        } catch (error) {
            this.handleError(error, 'Error creating review comment', false);
            return `Error! Please ensure that the lines you specify for the comment are part of the DIFF! Error message: ${error.message}`;
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
            await this.initCodeReviewAssistant();
            let retries = 0;
            const maxRetries = 3;
            let thread;
            while (retries < maxRetries) {
                thread = await this.openai.beta.threads.create();
                try {
                    reviewSummary = await this.doReviewImpl(simpleChangedFiles, thread);
                    break;
                } catch (error) {
                    await this.openai.beta.threads.del(thread.id)
                        .catch(delError => warning(`Error deleting thread: ${delError.message}`));
                    retries++;
                    if (retries >= maxRetries) {
                        this.handleError(error, 'Max retries reached for code review');
                    }
                    warning(`Retry ${retries}/${maxRetries}: ${error.message}`);
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
                }
            }
        } catch (error) {
            this.handleError(error, 'Error in code review process', false);
        }
        return reviewSummary;
    }

    async doReviewImpl(simpleChangedFiles, thread) {
        await this.openai.beta.threads.messages.create(
            thread.id,
            { role: "user", content: `${JSON.stringify(simpleChangedFiles)}` }
        );
        const run = await this.openai.beta.threads.runs.createAndPoll(
            thread.id,
            { assistant_id: this.assistant.id }
        );
        const summary = await this.processRun(thread, run);
        const messages = await this.openai.beta.threads.messages.list(thread.id);
        
        info("info log, messages:");
        for (const message of messages.data.reverse()) {
            info(`[${message.role}]: ${message.content[0].text.value}`);
        }

        return summary;
    }

    async processRun(thread, run) {
        let summary = '';
        let iterations = 0;
        const maxIterations = 42;
        let runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
        do {
            runStatus = await this.openai.beta.threads.runs.retrieve(thread.id, run.id);
            let tools_results = [];
            if (runStatus.status === 'requires_action') {
                for (const toolCall of runStatus.required_action.submit_tool_outputs.tool_calls) {
                    let result = '';
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        if (toolCall.function.name === 'getFileContent') {
                            result = await this.getFileContent(args);
                        } else if (toolCall.function.name === 'addReviewCommentToFileLine') {
                            result = await this.addReviewCommentToFileLine(args);
                        } else if (toolCall.function.name === 'markAsDone') {
                            summary = args.briefSummary;
                            return summary;
                        } else {
                            result = `Unknown tool requested: ${toolCall.function.name}`;
                        }
                    } catch (error) {
                        result = `Error processing tool call: ${error.message}`;
                    }
                    tools_results.push({ tool_call_id: toolCall.id, output: result });
                }
                await this.openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
                    tool_outputs: tools_results,
                });
            }
            iterations++;
            if (iterations > maxIterations) {
                throw new Error("Too many iterations, stopping the loop to prevent a hang.");
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        } while (runStatus.status !== "completed");
        return summary;
    }
}

module.exports = OpenAIAgent;
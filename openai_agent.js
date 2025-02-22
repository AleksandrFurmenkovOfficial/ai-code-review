const { warning, info } = require("@actions/core");
const { OpenAI } = require('openai');

class OpenAIAgent {
    /**
     * Creates a new OpenAI agent for code review.
     * @param {string} apiKey - The OpenAI API key.
     * @param {Function} fileContentGetter - Function to get file content.
     * @param {Function} fileCommentator - Function to add review comments.
     * @param {string} model - The OpenAI model to use.
     */
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        this.openai = new OpenAI({ apiKey });
        this.fileContentGetter = fileContentGetter;
        this.fileCommentator = fileCommentator;
        this.fileCache = {};
        this.model = model;
    }

    /**
     * Handles errors by logging and optionally throwing them.
     * @param {Error} error - The error to handle.
     * @param {string} message - The custom error message.
     * @param {boolean} throwError - Whether to throw the error.
     */
    handleError(error, message, throwError = true) {
        warning(`${message}: ${error.message}`);
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
                    "Review the user's changes for logical errors, security issues, and best practices.\n" +
                    "Use the 'addReviewCommentToFileLine' tool to add specific, actionable comments.\n" +
                    "Avoid repeating the same issue multiple times.\n" +
                    "Comment only when you are 100% confident about the issue.\n" +
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
                            description: "Adds a review comment to a specific line in the pull request diff",
                            parameters: {
                                type: "object",
                                properties: {
                                    fileName: {
                                        type: "string",
                                        description: "The relative path to the file that necessitates a comment"
                                    },
                                    lineNumber: {
                                        type: "integer",
                                        description: "The line number in the pull request diff that the comment applies to. For a multi-line comment, the last line of the range that your comment applies to."
                                    },
                                    foundIssueDescription: {
                                        type: "string",
                                        description: "The review comment content"
                                    },
                                    side: {
                                        type: "string",
                                        description: "In a split diff view, the side of the diff that the pull request's changes appear on. Can be LEFT for deletions or RIGHT for additions/unchanged lines",
                                        enum: ["LEFT", "RIGHT"],
                                        default: "RIGHT"
                                    }
                                },
                                required: ["fileName", "lineNumber", "foundIssueDescription"]
                            }
                        }
                    },
                    {
                        type: "function",
                        function: {
                            name: "codeReviewDone",
                            description: "Marks the code review as completed.",
                            parameters: {}
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
        const span = 20;

        try {
            if (!(pathToFile in this.fileCache)) {
                this.fileCache[pathToFile] = await this.fileContentGetter(pathToFile);
            }
            const content = this.fileCache[pathToFile];
            return `${pathToFile}\n'''\n${content.substring(startLineNumber - span, endLineNumber + span)}\n'''\n`;
        } catch (error) {
            this.handleError(error, 'Error getting file content', false);
            return `Error getting file content: ${error.message}`;
        }
    }

    /**
     * Adds a review comment to a file line.
     * @param {Object} args - The arguments for the function.
     * @param {string} args.fileName - The relative path to the file.
     * @param {number} args.lineNumber - The line number in the file.
     * @param {string} args.foundIssueDescription - Description of the issue found.
     * @param {string} [args.side="RIGHT"] - The side of the diff (LEFT or RIGHT).
     * @returns {Promise<string>} The result of the operation.
     */
    async addReviewCommentToFileLine(args) {
        const { fileName, lineNumber, foundIssueDescription, side = "RIGHT" } = args;
        try {
            await this.fileCommentator(foundIssueDescription, fileName, side, lineNumber);
            return "The review comment has been published.";
        } catch (error) {
            this.handleError(error, 'Error creating review comment', false);
            return `Error creating review comment: ${error.message}`;
        }
    }

    async doReview(changedFiles) {
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

            while (retries < maxRetries) {
                this.thread = await this.openai.beta.threads.create();
                try {
                    await this.doReviewImpl(simpleChangedFiles);
                    break;
                } catch (error) {
                    await this.openai.beta.threads.del(this.thread.id)
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
    }

    async doReviewImpl(simpleChangedFiles) {
        this.message = await this.openai.beta.threads.messages.create(
            this.thread.id,
            {
                role: "user",
                content: `${JSON.stringify(simpleChangedFiles)}`
            }
        );

        this.run = await this.openai.beta.threads.runs.createAndPoll(
            this.thread.id,
            {
                assistant_id: this.assistant.id,
            }
        );

        await this.processRun();

        const messages = await this.openai.beta.threads.messages.list(
            this.thread.id
        );

        for (const message of messages.data.reverse()) {
            console.log(`${message.role} > ${message.content[0].text.value}`);
        }
    }

    async processRun() {
        do {
            this.runStatus = await this.openai.beta.threads.runs.retrieve(this.thread.id, this.run.id);

            let tools_results = []
            if (this.runStatus.status === 'requires_action') {
                for (const toolCall of this.runStatus.required_action.submit_tool_outputs.tool_calls) {
                    let result = '';
                    let args = JSON.parse(toolCall.function.arguments);
                    if (toolCall.function.name == 'getFileContent') {
                        result = await this.getFileContent(args);
                    }
                    else if (toolCall.function.name == 'addReviewCommentToFileLine') {
                        result = await this.addReviewCommentToFileLine(args);
                    }
                    else if (toolCall.function.name == 'codeReviewDone') {
                        return;
                    }
                    else {
                        result = `Unknown tool requested: ${toolCall.function.name}`;
                    }

                    tools_results.push({ tool_call_id: toolCall.id, output: result })
                }

                await this.openai.beta.threads.runs.submitToolOutputs(this.thread.id, this.run.id, {
                    tool_outputs: tools_results,
                });
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        } while (this.runStatus.status !== "completed");
    }
}

module.exports = OpenAIAgent;

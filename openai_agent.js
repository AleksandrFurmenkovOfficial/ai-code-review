const core = require("@actions/core");
const { OpenAI } = require('openai');

const MODEL_NAME = 'gpt-4-turbo';
const MAX_TOKENS = 128000;
const TOKEN_TO_SYMBOL_RATIO = 4;
const MAX_SYMBOLS = MAX_TOKENS * TOKEN_TO_SYMBOL_RATIO;
const APPROX_MAX_SYMBOLS = Math.floor((MAX_SYMBOLS / 5) * 3); // 3/5 of the approximate maximum symbols

class OpenAIAPI {
    constructor(apiKey, fileContentGetter, fileCommenter) {
        this.openaiClient = new OpenAI({ apiKey });
        this.fileContentGetter = fileContentGetter;
        this.fileCommenter = fileCommenter;
        this.maxSymbols = APPROX_MAX_SYMBOLS;
        this.messages = [{
            role: "system",
            content:
                "You are an expert in software development and particularly in code review.\n" +
                "Review the user's changes for logical errors, poor structure, and typos.\n" +
                "Use the 'addReviewCommentToFileLine' tool to add a note to a code snippet that contains a mistake.\n" +
                "Avoid repeating the same issue multiple times! Look for other serious mistakes."
        }];
    }

    wrapFileContent(filename, content) {
        return `${filename}\n'''\n${content}\n'''\n`;
    }

    addAssistantMsg(message) {
        this.messages.push({ role: "assistant", content: message });
        core.info(`Assistant message added: ${message}`);
    }

    addUserMsg(message) {
        this.messages.push({ role: "user", content: message });
        core.info(`User message added: ${message}`);
    }

    addFunctionResult(functionName, result) {
        this.messages.push({
            role: "function",
            name: functionName,
            content: `{"result": ${JSON.stringify(result)}}`
        });
        core.info(`Function result added: ${functionName}`);
    }

    getUsedSymbols() {
        return this.messages.reduce((total, message) => total + message.content.length, 0);
    }

    convertToSimplifiedFormat(changedFiles) {
        return changedFiles.map(file => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
            patch: file.patch
        }));
    }

    async doReview(changedFiles) {
        changedFiles = this.convertToSimplifiedFormat(changedFiles);

        core.info(`Starting review for ${changedFiles}`);
        this.addUserMsg(JSON.stringify(changedFiles));

        const maxRetries = 5;
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await this.requestReview();
                if (response.choices[0].finish_reason === 'tool_calls') {
                    const { tool_calls } = response.choices[0].message;
                    const args = JSON.parse(tool_calls[0].function.arguments);

                    switch (tool_calls[0].name) {
                        case 'getFileContent':
                            this.wrapAndAddFileContent(args, await this.fileContentGetter(args.pathToFile));
                            break;
                        case 'addReviewCommentToFileLine':
                            await this.addReviewComment(args);
                            break;
                    }
                    continue;
                }
                return response.choices[0].message.content;
            } catch (error) {
                core.warning(`Error encountered: ${error.message}; retrying...`);
                retries++;
                if (retries >= maxRetries) throw new Error("Max retries reached. Unable to complete code review.");
                await this.retryDelay(retries);
            }
        }
    }

    async requestReview() {
        return await this.openaiClient.chat.completions.create({
            model: MODEL_NAME,
            messages: this.messages,
            tools: [{
                type: "function",
                function: {
                    name: "getFileContent",
                    description: "Gets the file content to better understand the provided changes",
                    parameters: {
                        type: "object",
                        properties: {
                            pathToFile: { type: "string", description: 'The fully qualified path to the file.' },
                            startLineNumber: { type: "integer", description: 'The start line number where the diff begins.' },
                            endLineNumber: { type: "integer", description: 'The end line number where the diff ends.' },
                        },
                        required: ["pathToFile", "startLineNumber", "endLineNumber"],
                    },
                }
            },
            {
                type: "function",
                function: {
                    name: "addReviewCommentToFileLine",
                    description: "Adds an AI-generated review comment to the specified line.",
                    parameters: {
                        type: "object",
                        properties: {
                            fileName: { type: "string", description: 'The relative path to the file.' },
                            lineNumber: { type: "integer", description: 'The line number in the file.' },
                            reviewCommentFromAIExpert: { type: "string", description: 'Code-review comment.' }
                        },
                        required: ["fileName", "lineNumber", "reviewCommentFromAIExpert"],
                    },
                }
            }]
        });
    }

    wrapAndAddFileContent(args, fileContent) {
        const { pathToFile } = args;
        let contentToUse = this.wrapFileContent(pathToFile, fileContent);
        if (this.getUsedSymbols() + contentToUse.length > this.maxSymbols) {
            core.info("Context size exceeded, attempting to shorten content.");
            contentToUse = this.shortenContent(args, fileContent);
        }
        this.addFunctionResult('getFileContent', contentToUse);
    }

    shortenContent(args, content) {
        const { startLineNumber, endLineNumber } = args;
        return this.wrapFileContent(args.pathToFile, content.substring(startLineNumber - 20, endLineNumber + 20));
    }

    async addReviewComment(args) {
        const { reviewCommentFromAIExpert, fileName, lineNumber } = args;
        await this.fileCommenter(reviewCommentFromAIExpert, fileName, lineNumber + 1);

        this.addAssistantMsg(`Review added to ${fileName} at line ${lineNumber}: '${reviewCommentFromAIExpert}'`);
        this.addUserMsg("Review comment added. Continuing to next potential issue.");
    }

    async retryDelay(retries) {
        const delay = Math.pow(2, retries) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
}

module.exports = OpenAIAPI;
const { OpenAI } = require('openai');
const BaseAIAgent = require("./base-ai-agent");

const c_max_completion_tokens = 8192;

class OpenAIAgent extends BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model);
        this.openai = new OpenAI({ apiKey });
        this.tools = [
            {
                type: "function",
                function: {
                    name: "get_file_content",
                    description: "Retrieves file content for context",
                    parameters: {
                        type: "object",
                        properties: {
                            path_to_file: { type: "string", description: "The fully qualified path to the file" },
                            start_line_number: { type: "integer", description: "The starting line from the file content to retrieve, counting from one" },
                            end_line_number: { type: "integer", description: "The ending line from the file content to retrieve, counting from one" }
                        },
                        required: ["path_to_file", "start_line_number", "end_line_number"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "add_review_comment",
                    description: "Adds a review comment to a specific range of lines in the pull request diff",
                    parameters: {
                        type: "object",
                        properties: {
                            file_name: { type: "string", description: "The relative path to the file that necessitates a comment" },
                            start_line_number: { type: "integer", description: "The starting line number where the comment should begin from the diff hunk (start_line_number must be strictly greater than first diff hunk line number)" },
                            end_line_number: { type: "integer", description: "The ending line number where the comment should end from the diff hunk (end_line_number must be strictly greater than start_line_number and strictly less than last diff hunk line number)" },
                            found_error_description: { type: "string", description: "The review comment content" },
                            side: { type: "string", description: "In a split diff view, the side of the diff that the pull request's changes appear on. Can be LEFT or RIGHT. Use LEFT only for deletions. Use RIGHT for additions/changes! For a multi-line comment, side represents whether the last line of the comment range is a deletion or addition. If unknown use 'Diff view options' from GitHub Help documentation or prefer RIGHT.", enum: ["LEFT", "RIGHT"], default: "RIGHT" }
                        },
                        required: ["file_name", "start_line_number", "end_line_number", "found_error_description"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "mark_as_done",
                    description: "Marks the code review as completed and provides a brief summary of the changes",
                    parameters: {
                        type: "object",
                        properties: {
                            brief_summary: { type: "string", description: "A brief summary of the changes reviewed. Do not repeat comments. Focus on overall quality and any patterns observed." }
                        },
                        required: ["brief_summary"]
                    }
                }
            }
        ];
    }

    async initialize() {
        // Simple initialization; additional initialization logic can be added here.
        return true;
    }

    async handleMessageResponse(message, reviewState) {
        if (!message) {
            throw new Error("Invalid response from OpenAI API");
        }

        reviewState.iterationCount++;
        if (reviewState.iterationCount >= reviewState.maxIterations) {
            return `Code review terminated after ${reviewState.iterationCount} iterations. Reviewed ${reviewState.reviewedFiles.size} files with ${reviewState.commentsMade} comments.`;
        }

        reviewState.messageHistory.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });

        if (message.tool_calls && message.tool_calls.length > 0) {
            const toolResponses = await Promise.all(message.tool_calls.map(async (toolCall) => {
                try {
                    const input = JSON.parse(toolCall.function.arguments);
                    let toolResponse;

                    if (toolCall.function.name === 'get_file_content') {
                        const { path_to_file, start_line_number, end_line_number } = input;
                        const fileRequestKey = `${path_to_file}-${start_line_number}-${end_line_number}`;
                        if (reviewState.seenToolCalls.has(fileRequestKey)) {
                            toolResponse = `Previously provided content for ${path_to_file} lines ${start_line_number}-${end_line_number}.`;
                        } else {
                            toolResponse = await this.getFileContentWithCache(path_to_file, start_line_number, end_line_number);
                            reviewState.seenToolCalls.add(fileRequestKey);
                            reviewState.processedFiles.add(path_to_file);
                        }
                    } else if (toolCall.function.name === 'add_review_comment') {
                        const { file_name, start_line_number, end_line_number, found_error_description, side = "RIGHT" } = input;
                        toolResponse = await this.addReviewComment(file_name, start_line_number, end_line_number, found_error_description, side);
                        reviewState.reviewedFiles.add(file_name);
                        reviewState.commentsMade++;
                    } else if (toolCall.function.name === 'mark_as_done') {
                        reviewState.summary = input.brief_summary;
                        return null; // No need to add tool response for mark_as_done
                    } else {
                        toolResponse = `Unknown tool: ${toolCall.function.name}`;
                    }

                    return {
                        role: 'tool',
                        content: toolResponse,
                        tool_call_id: toolCall.id
                    };
                } catch (error) {
                    return {
                        role: 'tool',
                        content: `Error: ${error.message}`,
                        tool_call_id: toolCall.id
                    };
                }
            }));

            // Filter out null responses (e.g., from mark_as_done)
            const validResponses = toolResponses.filter(response => response !== null);
            reviewState.messageHistory.push(...validResponses);

            // If mark_as_done was called, return the summary
            if (reviewState.summary) {
                return reviewState.summary;
            }

            // Proceed to the next API call
            const nextResponse = await this.openai.chat.completions.create({
                model: this.model,
                messages: [{ role: 'system', content: this.getSystemPrompt() }, ...reviewState.messageHistory],
                tools: this.tools,
                max_completion_tokens: c_max_completion_tokens
            });
            const nextMessage = nextResponse.choices[0].message;
            return await this.handleMessageResponse(nextMessage, reviewState);
        } else {
            if (message.content && !reviewState.summary) {
                reviewState.summary = message.content;
            }
            return reviewState.summary || `Code review completed. Reviewed ${reviewState.reviewedFiles.size} files with ${reviewState.commentsMade} comments.`;
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

        const reviewState = {
            summary: '',
            reviewedFiles: new Set(),
            commentsMade: 0,
            maxIterations: 142, // Prevent infinite loops
            iterationCount: 0,
            seenToolCalls: new Set(),
            processedFiles: new Set(),
            messageHistory: []
        };

        const initialUserMessage = {
            role: 'user',
            content: `Changed files for review (${changedFiles.length} files): ${JSON.stringify(simpleChangedFiles, null, 2)}`
        };

        reviewState.messageHistory.push(initialUserMessage);

        const initialResponse = await this.openai.chat.completions.create({
            model: this.model,
            messages: [{ role: 'system', content: this.getSystemPrompt() }, ...reviewState.messageHistory],
            tools: this.tools,
            max_completion_tokens: c_max_completion_tokens
        });
        const initialMessage = initialResponse.choices[0].message;
        reviewSummary = await this.handleMessageResponse(initialMessage, reviewState);
        return reviewSummary;
    }

    async getFileContent(args) {
        const { pathToFile, startLineNumber, endLineNumber } = args;
        return await this.getFileContentWithCache(pathToFile, startLineNumber, endLineNumber);
    }

    async addReviewCommentToFileLine(args) {
        const { fileName, startLineNumber, endLineNumber, foundErrorDescription, side = "RIGHT" } = args;
        return await this.addReviewComment(fileName, startLineNumber, endLineNumber, foundErrorDescription, side);
    }
}

module.exports = OpenAIAgent;

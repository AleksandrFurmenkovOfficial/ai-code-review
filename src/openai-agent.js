const { OpenAI } = require("openai");

const core = require("./core-wrapper");
const BaseAIAgent = require("./base-ai-agent");
const { MAX_REVIEW_ITERATIONS } = require("./constants");

/**
 * OpenAIAgent
 * -----------
 * Automates pull-request code review by orchestrating OpenAI function-calling
 * with three tools: get_file_content, add_review_comment, mark_as_done.
 *
 * **Public API is unchanged**; only internal loop/iteration logic was fixed.
 */
class OpenAIAgent extends BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent, baseURL = null) {
        super(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent);

        if (!baseURL || baseURL.trim() === "") {
            core.info("Using default OpenAI API URL");
            this.openai = new OpenAI({ apiKey });
        } else {
            core.info(`Using custom baseURL: ${baseURL}`);
            this.openai = new OpenAI({ apiKey, baseURL });
        }

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
                            start_line_number: { type: "integer", description: "The starting line number in the diff hunk where the comment should begin! (start_line_number must be strictly greater than first diff hunk line number)" },
                            end_line_number: { type: "integer", description: "The ending line number in the diff hunk where the comment should end! (end_line_number must be strictly greater than start_line_number and strictly less than last diff hunk line number)" },
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


    /* ------------------------------------------------------------------ */
    /* life-cycle                                                         */
    /* ------------------------------------------------------------------ */
    initialize() {
        return true;
    }

    /**
     * Iteratively processes the assistant’s replies and tool calls until:
     *   • mark_as_done returns a summary, or
     *   • iterationCount reaches maxIterations
     */
    async handleMessageResponse(initialMessage, reviewState) {
        let message = initialMessage;

        while (true) {
            if (!message) {
                throw new Error("Invalid response from OpenAI API");
            }

            /* ── iteration guard (full quota honoured) ── */
            if (reviewState.iterationCount >= reviewState.maxIterations) {
                return (
                    `Code review terminated after ${reviewState.iterationCount} iterations.` +
                    ` Reviewed ${reviewState.reviewedFiles.size} files with ${reviewState.commentsMade} comments.`
                );
            }
            reviewState.iterationCount++;

            /* track assistant reply */
            reviewState.messageHistory.push({
                role: "assistant",
                content: message.content,
                tool_calls: message.tool_calls
            });

            /* ──────────────  TOOL-CALL HANDLING  ────────────── */
            if (message.tool_calls && message.tool_calls.length) {
                const toolReplies = await Promise.all(
                    message.tool_calls.map(async (toolCall) => {
                        try {
                            const input = JSON.parse(toolCall.function.arguments);
                            let toolOutput;

                            switch (toolCall.function.name) {
                                case "get_file_content": {
                                    const {
                                        path_to_file,
                                        start_line_number,
                                        end_line_number
                                    } = input;
                                    toolOutput = await this.getFileContentWithCache(
                                        path_to_file,
                                        start_line_number,
                                        end_line_number
                                    );
                                    break;
                                }
                                case "add_review_comment": {
                                    const {
                                        file_name,
                                        start_line_number,
                                        end_line_number,
                                        found_error_description,
                                        side = "RIGHT"
                                    } = input;
                                    toolOutput = await this.addReviewComment(
                                        file_name,
                                        start_line_number,
                                        end_line_number,
                                        found_error_description,
                                        side
                                    );
                                    reviewState.reviewedFiles.add(file_name);
                                    reviewState.commentsMade++;
                                    break;
                                }
                                case "mark_as_done": {
                                    reviewState.summary = input.brief_summary;
                                    return null; // no reply message needed
                                }
                                default:
                                    toolOutput = `Unknown tool: ${toolCall.function.name}`;
                            }

                            return {
                                role: "tool",
                                content: toolOutput,
                                tool_call_id: toolCall.id
                            };
                        } catch (err) {
                            return {
                                role: "tool",
                                content: `Error: ${err.message}`,
                                tool_call_id: toolCall.id
                            };
                        }
                    })
                );

                /* append non-null replies */
                reviewState.messageHistory.push(...toolReplies.filter(Boolean));

                /* if mark_as_done set summary, we’re finished */
                if (reviewState.summary) {
                    return reviewState.summary;
                }

                /* ── follow-up call ── */
                try {
                    core.info(`Sending follow-up request to OpenAI with model: ${this.model}`);
                    const followUp = await this.openai.chat.completions.create({
                        model: this.model,
                        messages: [
                            { role: "system", content: this.getSystemPrompt() },
                            ...reviewState.messageHistory
                        ],
                        tools: this.tools
                    });
                    message = followUp.choices[0].message; // continue loop
                    continue;
                } catch (error) {
                    core.error(`OpenAI API error in follow-up: ${error.message}`);
                    if (error.response) {
                        core.error(`Status: ${error.response.status}`);
                        core.error(`Data: ${JSON.stringify(error.response.data)}`);
                    }
                    throw error;
                }
            }

            /* ──────────────  if no tool calls: maybe final summary ────────────── */
            if (message.content && !reviewState.summary) {
                reviewState.summary = message.content;
            }
            return (
                reviewState.summary ||
                `Code review completed. Reviewed ${reviewState.reviewedFiles.size} files with ${reviewState.commentsMade} comments.`
            );
        } // end while
    }

    /**
     * Entrypoint called by the GitHub Action runner.
     */
    async doReview(changedFiles) {
        let reviewSummary = "";

        /* simplify diff metadata to keep prompt small */
        const simpleChangedFiles = changedFiles.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            patch: f.patch
        }));

        const reviewState = {
            summary: "",
            reviewedFiles: new Set(),
            commentsMade: 0,
            maxIterations: MAX_REVIEW_ITERATIONS,
            iterationCount: 0,
            messageHistory: []
        };

        /* initial user message */
        reviewState.messageHistory.push({
            role: "user",
            content: `Changed files for review (${changedFiles.length} files): ${JSON.stringify(
                simpleChangedFiles,
                null,
                2
            )}`
        });

        try {
            core.info(`Sending initial request to OpenAI with model: ${this.model}`);
            const initial = await this.openai.chat.completions.create({
                model: this.model,
                messages: [
                    { role: "system", content: this.getSystemPrompt() },
                    ...reviewState.messageHistory
                ],
                tools: this.tools
            });
            const initialMessage = initial.choices[0].message;
            reviewSummary = await this.handleMessageResponse(initialMessage, reviewState);
            return reviewSummary;
        } catch (error) {
            core.error(`OpenAI API error: ${error.message}`);
            if (error.response) {
                core.error(`Status: ${error.response.status}`);
                core.error(`Data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /* helper stubs (public API unchanged) ------------------------------ */
    getFileContent(args) {
        const { pathToFile, startLineNumber, endLineNumber } = args;
        return this.getFileContentWithCache(pathToFile, startLineNumber, endLineNumber);
    }
    addReviewCommentToFileLine(args) {
        const {
            fileName,
            startLineNumber,
            endLineNumber,
            foundErrorDescription,
            side = "RIGHT"
        } = args;
        return this.addReviewComment(
            fileName,
            startLineNumber,
            endLineNumber,
            foundErrorDescription,
            side
        );
    }
}

module.exports = OpenAIAgent;

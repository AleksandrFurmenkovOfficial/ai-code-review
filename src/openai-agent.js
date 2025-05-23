const core = require("@actions/core");
const { OpenAI } = require('openai');
const BaseAIAgent = require("./base-ai-agent");

class OpenAIAgent extends BaseAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, baseURL = null, githubAPI, owner, repo, prHeadBranch) {
        super(apiKey, fileContentGetter, fileCommentator, model);

        this.githubAPI = githubAPI;
        this.owner = owner;
        this.repo = repo;
        this.prHeadBranch = prHeadBranch;

        if (baseURL == null || baseURL === undefined || baseURL.trim() === '' ) {
            core.info("Using default OpenAI API URL");
            this.openai = new OpenAI({ apiKey});
        }
        else {
            core.info(`Using custom baseUrl: ${baseURL}`);
            this.openai = new OpenAI({ apiKey : apiKey, baseURL : baseURL});
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
                    description: "Adds a review comment to a specific range of lines in the pull request diff. To suggest a specific code change for a line or range of lines, format the 'found_error_description' using GitHub's suggestion markdown: ```suggestion\\n[your new code]\\n```. Ensure the line numbers correctly target the area for the suggestion.",
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
            },
            {
                type: "function",
                function: {
                    name: "edit_file",
                    description: "Edits an existing file by replacing its entire content. This creates a new commit on the pull request's current branch. Use this for significant revisions where a targeted suggestion isn't practical. Provide a concise and descriptive commit_message.",
                    parameters: {
                        type: "object",
                        properties: {
                            file_path: { type: "string", description: "The relative path (from the repository root) to the file to be edited." },
                            new_content: { type: "string", description: "The full new content of the file." },
                            commit_message: { type: "string", description: "The commit message for this change." }
                        },
                        required: ["file_path", "new_content", "commit_message"]
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
                    } else if (toolCall.function.name === 'edit_file') {
                        toolResponse = await this.handleEditFile(input);
                        reviewState.editedFiles = reviewState.editedFiles || new Set();
                        reviewState.editedFiles.add(input.file_path);
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
            try {
                core.info(`Sending follow-up request to OpenAI with model: ${this.model}`);
                const nextResponse = await this.openai.chat.completions.create({
                    model: this.model,
                    messages: [{ role: 'system', content: this.getSystemPrompt() }, ...reviewState.messageHistory],
                    tools: this.tools
                });
                const nextMessage = nextResponse.choices[0].message;
                return await this.handleMessageResponse(nextMessage, reviewState);
            } catch (error) {
                core.error(`OpenAI API error in follow-up request: ${error.message}`);
                if (error.response) {
                    core.error(`Status: ${error.response.status}`);
                    core.error(`Data: ${JSON.stringify(error.response.data)}`);
                }
                throw error;
            }
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
            editedFiles: new Set(), // Initialize editedFiles
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

        try {
            core.info(`Sending initial request to OpenAI with model: ${this.model}`);
            const initialResponse = await this.openai.chat.completions.create({
                model: this.model,
                messages: [{ role: 'system', content: this.getSystemPrompt() }, ...reviewState.messageHistory],
                tools: this.tools
            });
            const initialMessage = initialResponse.choices[0].message;
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

    async getFileContent(args) {
        const { pathToFile, startLineNumber, endLineNumber } = args;
        return await this.getFileContentWithCache(pathToFile, startLineNumber, endLineNumber);
    }

    async addReviewCommentToFileLine(args) {
        const { fileName, startLineNumber, endLineNumber, foundErrorDescription, side = "RIGHT" } = args;
        return await this.addReviewComment(fileName, startLineNumber, endLineNumber, foundErrorDescription, side);
    }

    async handleEditFile(args) {
        const { file_path, new_content, commit_message } = args;
        if (!this.githubAPI || !this.owner || !this.repo || !this.prHeadBranch) {
            throw new Error("GitHub API details and repository context are not available for editing files.");
        }
        try {
            core.info(`Attempting to edit file: ${file_path} in branch ${this.prHeadBranch}`);
            const currentFileSha = await this.githubAPI.getFileSHA(this.owner, this.repo, this.prHeadBranch, file_path);

            await this.githubAPI.createOrUpdateFile(
                this.owner,
                this.repo,
                this.prHeadBranch,
                file_path,
                new_content,
                currentFileSha, // Pass null if file is new, createOrUpdateFileContents handles this
                commit_message
            );
            return `Successfully edited file: ${file_path} and committed with message: "${commit_message}"`;
        } catch (error) {
            core.error(`Error editing file ${file_path}: ${error.message}`);
            throw new Error(`Failed to edit file ${file_path}: ${error.message}`);
        }
    }
}

module.exports = OpenAIAgent;

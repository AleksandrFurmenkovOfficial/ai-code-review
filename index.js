const core = require("@actions/core");

const GitHubAPI = require("./githubapi.js");
const OpenAIAgent = require("./openai_agent.js");

const validateInputs = (repo, owner, pullNumber, githubToken, aiProvider, apiKey) => {
    if (!repo) throw new Error("Repository name is required.");
    if (!owner) throw new Error("Owner name is required.");
    if (!pullNumber || isNaN(pullNumber)) throw new Error("Pull request number must be a valid number.");
    if (!githubToken) throw new Error("GitHub token is required.");
    if (!aiProvider) throw new Error("AI provider is required.");
    if (!apiKey) throw new Error(`${aiProvider} API key is required.`);
};

const AI_REVIEW_COMMENT_PREFIX = "AI review done up to commit: ";

const main = async () => {
    const getFilteredChangedFiles = (changedFiles, includeExtensions, excludeExtensions, includePaths, excludePaths) => {
        const stringToArray = (inputString) => inputString.split(',').map(item => item.trim().replace(/\\/g, '/')).filter(Boolean);

        const includeExtensionsArray = stringToArray(includeExtensions);
        const excludeExtensionsArray = stringToArray(excludeExtensions);
        const includePathsArray = stringToArray(includePaths);
        const excludePathsArray = stringToArray(excludePaths);

        const isFileToReview = (filename) => {
            const isIncludedExtension = includeExtensionsArray.length === 0 || includeExtensionsArray.some(ext => filename.endsWith(ext));
            const isExcludedExtension = excludeExtensionsArray.length > 0 && excludeExtensionsArray.some(ext => filename.endsWith(ext));
            const isIncludedPath = includePathsArray.length === 0 || includePathsArray.some(path => filename.startsWith(path));
            const isExcludedPath = excludePathsArray.length > 0 && excludePathsArray.some(path => filename.startsWith(path));

            return isIncludedExtension && !isExcludedExtension && isIncludedPath && !isExcludedPath;
        };

        return changedFiles.filter(file => isFileToReview(file.filename.replace(/\\/g, '/')));
    };

    try {
        const repo = core.getInput("repo", { required: true, trimWhitespace: true });
        const owner = core.getInput("owner", { required: true, trimWhitespace: true });
        const pullNumber = core.getInput("pr_number", { required: true, trimWhitespace: true });
        const githubToken = core.getInput("token", { required: true, trimWhitespace: true });
        const aiProvider = core.getInput("ai_provider", { required: true, trimWhitespace: true });
        const apiKey = core.getInput(`${aiProvider}_api_key`, { required: true, trimWhitespace: true });
        const model = core.getInput(`${aiProvider}_model`, { required: true, trimWhitespace: true });
        const failAction = core.getInput("fail_action_if_review_failed", { required: false, trimWhitespace: true }).toLowerCase() === 'true';

        validateInputs(repo, owner, pullNumber, githubToken, aiProvider, apiKey);

        const includeExtensions = core.getInput("include_extensions", { required: false });
        const excludeExtensions = core.getInput("exclude_extensions", { required: false });
        const includePaths = core.getInput("include_paths", { required: false });
        const excludePaths = core.getInput("exclude_paths", { required: false });

        const githubAPI = new GitHubAPI(githubToken);
        const pullRequestData = await githubAPI.getPullRequest(owner, repo, pullNumber);
        
        // Find the last AI review comment
        const comments = await githubAPI.listPRComments(owner, repo, pullNumber);
        const lastReviewComment = comments
            .reverse()
            .find(comment => comment.body.startsWith(AI_REVIEW_COMMENT_PREFIX));

        let changedFiles;
        const headCommit = pullRequestData.head.sha;

        if (lastReviewComment) {
            core.info(`lastReviewComment: ${lastReviewComment}`);

            // Extract the last reviewed commit hash
            const lastReviewedCommit = lastReviewComment.body
                .replace(AI_REVIEW_COMMENT_PREFIX, '')
                .split(' ')[0];

            // Get changes since the last review
            changedFiles = await githubAPI.getFilesBetweenCommits(
                owner,
                repo,
                lastReviewedCommit,
                headCommit
            );
        } else {
            // First review - get all changes
            changedFiles = await githubAPI.listFiles(owner, repo, pullNumber);
        }

        const filteredChangedFiles = getFilteredChangedFiles(
            changedFiles,
            includeExtensions,
            excludeExtensions,
            includePaths,
            excludePaths
        );

        if (filteredChangedFiles.length === 0) {
            core.info('No files to review');
            return;
        }

        // Setup file content getter and commentator
        const fileContentGetter = async (filePath) => 
            await githubAPI.getContent(owner, repo, filePath, headCommit);
        
        const fileCommentator = async (comment, filePath, side, line) => {
            await githubAPI.createReviewComment(
                owner,
                repo,
                pullNumber,
                headCommit,
                comment,
                filePath,
                side,
                line
            );
        };

        // Initialize AI agent
        let aiAgent;
        switch (aiProvider) {
            case 'openai':
                aiAgent = new OpenAIAgent(apiKey, fileContentGetter, fileCommentator, model);
                break;
            // Add cases for other AI providers here
            // case 'google':
            //     aiAgent = new GoogleAgent(apiKey, fileContentGetter, fileCommentator, model);
            //     break;
            // case 'anthropic':
            //     aiAgent = new AnthropicAgent(apiKey, fileContentGetter, fileCommentator, model);
            //     break;
            // case 'deepseek':
            //     aiAgent = new DeepseekAgent(apiKey, fileContentGetter, fileCommentator, model);
            //     break;
            default:
                throw new Error(`Unsupported AI provider: ${aiProvider}`);
        }

        // Perform the review
        try {
            await aiAgent.doReview(filteredChangedFiles);

            // Add completion comment only if review was successful
            const commentLink = `${AI_REVIEW_COMMENT_PREFIX}${headCommit}`;
            await githubAPI.createPRComment(owner, repo, pullNumber, commentLink);
        } catch (error) {
            // Log full error stack trace
            core.error(error.stack);
            // Fail the GitHub Action if the new setting is true
            if (failAction) {
                core.setFailed(`Review failed: ${error.message}`);
            } else {
                throw error;
            }
        }
    } catch (error) {
        core.warning(`Warning: ${error.message}`);
        // Log full error stack trace
        core.error(error.stack);
        core.debug(error.stack);
    }
};

main();
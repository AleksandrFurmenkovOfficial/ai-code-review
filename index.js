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

        validateInputs(repo, owner, pullNumber, githubToken, aiProvider, apiKey);

        const includeExtensions = core.getInput("include_extensions", { required: false });
        const excludeExtensions = core.getInput("exclude_extensions", { required: false });
        const includePaths = core.getInput("include_paths", { required: false });
        const excludePaths = core.getInput("exclude_paths", { required: false });

        const githubAPI = new GitHubAPI(githubToken);
        const changedFiles = await githubAPI.listFiles(owner, repo, pullNumber);
        const filteredChangedFiles = getFilteredChangedFiles(changedFiles, includeExtensions, excludeExtensions, includePaths, excludePaths);

        const pullRequestData = await githubAPI.getPullRequest(owner, repo, pullNumber);
        const fileContentGetter = async (filePath) => await githubAPI.getContent(owner, repo, filePath, pullRequestData.head.sha);
        const fileCommentator = async (comment, filePath, side, line) => {
            await githubAPI.createReviewComment(
                owner,
                repo,
                pullNumber,
                pullRequestData.head.sha,
                comment,
                filePath,
                side,
                line
            );
        }

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

        await aiAgent.doReview(filteredChangedFiles);

    } catch (error) {
        core.warning(`Warning: ${error.message}`);
        core.debug(error.stack);
    }
};

main();
const core = require("@actions/core");

const GitHubAPI = require("./githubapi.js");
const OpenAIAgent = require("./openai_agent.js");

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
        const repo = core.getInput("repo", { required: true });
        const owner = core.getInput("owner", { required: true });
        const pullNumber = core.getInput("pr_number", { required: true });
        const githubToken = core.getInput("token", { required: true });
        const openaiApiKey = core.getInput("openai_api_key", { required: true });

        const includeExtensions = core.getInput("include_extensions", { required: false });
        const excludeExtensions = core.getInput("exclude_extensions", { required: false });
        const includePaths = core.getInput("include_paths", { required: false });
        const excludePaths = core.getInput("exclude_paths", { required: false });

        const githubAPI = new GitHubAPI(githubToken);
        const changedFiles = await githubAPI.listFiles(owner, repo, pullNumber);
        const filteredChangedFiles = getFilteredChangedFiles(changedFiles, includeExtensions, excludeExtensions, includePaths, excludePaths);

        const pullRequestData = await githubAPI.getPullRequest(owner, repo, pullNumber);
        const fileContentGetter = async (filePath) => await githubAPI.getContent(owner, repo, filePath, pullRequestData.head.sha);
        const fileCommentator = (comment, filePath, line) => {
            githubAPI.createReviewComment(owner, repo, pullNumber, pullRequestData.head.sha, comment, filePath, line);
        }
        const openAI = new OpenAIAgent(openaiApiKey, fileContentGetter, fileCommentator);
        await openAI.doReview(filteredChangedFiles);

    } catch (error) {
        core.warning(error);
    }
};

main();

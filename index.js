const core = require("@actions/core");
const GitHubAPI = require("./githubapi");
const OpenAIAPI = require("./openaiapi");

const isFileToReview = (filename, fileExtensions, excludePaths) => {
    if (fileExtensions) {
        const extensions = fileExtensions.split(",").map((ext) => ext.trim());
        if (!extensions.some((ext) => filename.endsWith(ext))) {
            return false;
        }
    }

    if (excludePaths) {
        const paths = excludePaths.split(",").map((path) => path.trim());
        if (paths.some((path) => filename.startsWith(path))) {
            return false;
        }
    }

    return true;
}

const getFilteredChangedFiles = (changedFiles, fileExtensions, excludePaths) => {
    let filteredFiles = changedFiles;
    return filteredFiles.filter((file) => isFileToReview(file.filename, fileExtensions, excludePaths));
};

const getApproxMaxSymbols = () => {
    const maxTokens = 70000;
    const maxSymbols = maxTokens * 4;
    const oneFifthInSymbols = maxSymbols / 5;
    const maxInputSymbols = oneFifthInSymbols * 4;
    return maxInputSymbols;
}

const getAIModelName = () => "gpt-4-1106-preview";

const processAllInOneStrategy = async (filteredChangedFiles, openaiAPI, githubAPI, owner, repo, pullNumber) => {
    let contentToReview = Object.values(filteredChangedFiles).reduce(
        (accumulator, file) => `${accumulator}${openaiAPI.wrapFileContent(file.filename, file.patch)}`,
        ""
    );
    if (contentToReview.length <= getApproxMaxSymbols()) {
        const commonComment = await openaiAPI.doReview(getAIModelName(), contentToReview);
        if (commonComment)
        {
          console.debug(commonComment);
          await githubAPI.createPRComment(owner, repo, pullNumber, commonComment);
          return true;
        }
    }

    return false;
}

const processDiffByDiffStrategy = async (filteredChangedFiles, openaiAPI) => {
    for (const file of filteredChangedFiles) {
        let contentToReview = `${openaiAPI.wrapFileContent(file.filename, file.patch)}`;
        if (contentToReview.length <= getApproxMaxSymbols()) {
            await openaiAPI.doReview(getAIModelName(), contentToReview);
        } else {
            console.info(`File patch ${file.filename} is too large to process.`);
            continue;
        }
    }
    
    return true;
}

const main = async () => {
    try {
        const repo = core.getInput("repo", { required: true });
        const owner = core.getInput("owner", { required: true });
        const pullNumber = core.getInput("pr_number", { required: true });

        const githubToken = core.getInput("token", { required: true });
        const githubAPI = new GitHubAPI(githubToken);
        const pullRequestData = await githubAPI.getPullRequest(owner, repo, pullNumber);
        const filesContentGetter = (filePath) => githubAPI.getContent(owner, repo, filePath, pullRequestData.head.sha);
        const inFileCommenter = (comment, filePath, line) => githubAPI.createReviewComment(owner, repo, pullNumber, pullRequestData.head.sha, comment, filePath, line);
        const openaiApiKey = core.getInput("openai_api_key", { required: true });
        const openaiAPI = new OpenAIAPI(openaiApiKey, filesContentGetter, inFileCommenter, getApproxMaxSymbols());

        const changedFiles = await githubAPI.listFiles(owner, repo, pullNumber);
        const fileExtensions = core.getInput("file_extensions", { required: false });
        const excludePaths = core.getInput("exclude_paths", { required: false });
        const filteredChangedFiles = getFilteredChangedFiles(
            changedFiles,
            fileExtensions,
            excludePaths
        );
       
        const allInOneSucess = await processAllInOneStrategy(filteredChangedFiles, openaiAPI, githubAPI, owner, repo, pullNumber);
        if (allInOneSucess)
            return;

        const diffByDiffSucess = await processDiffByDiffStrategy(filteredChangedFiles, openaiAPI);
        if (diffByDiffSucess)
            return;

        console.error("Have no strategy to process such a big PR.");
    } catch (error) {
        console.error(error);
        core.setFailed(error.message);
    }
};

main();

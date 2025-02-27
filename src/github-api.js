const github = require("@actions/github");
const core = require("@actions/core");

class GitHubAPI {
    constructor(token) {
        this.octokit = github.getOctokit(token);
    }

    /**
     * Generic method to fetch all paginated items
     * @param {Function} method - API method that executes the request
     * @param {Object} params - Parameters for the API method
     * @returns {Promise<Array>} - Array of all items from all pages
     */
    async getAllPaginatedItems(method, params) {
        const allItems = [];
        let page = 1;
        const perPage = 100;

        while (true) {
            const response = await method({
                ...params,
                per_page: perPage,
                page: page,
            });

            const items = response.data;
            allItems.push(...items);

            const linkHeader = response.headers && response.headers.link;
            const hasNextPage = linkHeader && linkHeader.includes('rel="next"');

            if (!hasNextPage || items.length < perPage) {
                break;
            }

            page++;
        }

        return allItems;
    }

    /**
     * Compares two commits.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {string} baseBranchName - The base branch name.
     * @param {string} headBranchName - The head branch name.
     * @returns {Promise<Object>} The comparison data.
     */
    async compareCommits(owner, repo, baseBranchName, headBranchName) {
        core.info(`compareCommits(${baseBranchName}, ${headBranchName})`);
        const { data: diff } = await this.octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: baseBranchName,
            head: headBranchName,
        });
        return diff;
    }

    /**
     * Retrieves a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Object>} The pull request data.
     */
    async getPullRequest(owner, repo, prNumber) {
        core.info(`getPullRequest()`);
        const { data: prData } = await this.octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
        });
        return prData;
    }

    /**
     * Retrieves the content of a file.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {string} baseRef - The reference (branch or commit SHA) to old file version.
     * @param {string} actualRef - The reference (branch or commit SHA) to new file version.
     * @param {string} filePath - The file path.
     * @returns {Promise<string>} The file content.
     */
    async getContent(owner, repo, baseRef, actualRef, filePath) {
        core.info(`getContent(${baseRef}, ${actualRef}, ${filePath})`);
        const { data: fileMetadata } = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path: filePath,
            ref: actualRef,
        });

        if (Array.isArray(fileMetadata) || fileMetadata.type !== 'file') {
            return `[${Array.isArray(fileMetadata) ? 'Directory' : fileMetadata.type} not shown]`;
        }

        if (fileMetadata.download_url) {
            // Check if the file is a text file by comparing changes between refs
            let isTextFile = true;
            try {
                // Compare the file between baseRef and actualRef
                const { data: comparison } = await this.octokit.rest.repos.compareCommits({
                    owner,
                    repo,
                    base: baseRef,
                    head: actualRef,
                });

                // Find the file in the comparison results
                const fileInfo = comparison.files.find(file => file.filename === filePath);

                // If the file has a patch, it's a text file
                isTextFile = fileInfo && fileInfo.patch !== undefined;
            } catch (error) {
                // If comparison fails, assume it's a binary
                console.warn(`Error checking file type: ${error.message}`);
                isTextFile = false;
            }

            if (!isTextFile) {
                return '[Binary file not shown in review]';
            }
        }

        if (fileMetadata.content && fileMetadata.encoding === 'base64') {
            return Buffer.from(fileMetadata.content, 'base64').toString('utf-8');
        }

        return '[File content unavailable]';
    }

    /**
     * Creates a comment on a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @param {string} body - The comment body.
     */
    async createPRComment(owner, repo, prNumber, body) {
        core.info(`createPRComment(${body})`);
        await this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
        });
    }

    /**
     * Creates a review comment on a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @param {string} commitId - The commit ID.
     * @param {string} body - The comment body.
     * @param {string} path - The relative path to the file that necessitates a comment.
     * @param {string} side - In a split diff view, the side of the diff that the pull request's changes appear on. Can be LEFT or RIGHT. Use LEFT for deletions that appear in red. Use RIGHT for additions that appear in green or unchanged lines that appear in white and are shown for context. For a multi-line comment, side represents whether the last line of the comment range is a deletion or addition. For more information, see "Diff view options" in the GitHub Help documentation.
     * @param {number} startLine - The start line number. The first line of the range that your comment applies to. The startLine must precede the end line.
     * @param {number} line - The line number. The line of the blob in the pull request diff that the comment applies to. For a multi-line comment, the last line of the range that your comment applies to.
     */
    async createReviewComment(owner, repo, prNumber, commitId, body, path, side, startLine, line) {
        core.info(`createReviewComment(${path}, ${side}, ${startLine}, ${line}): ${body}`);
        if (startLine === line) {
            core.info(`attempting to create a single line comment for line ${startLine}`);
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: prNumber,
                body,
                commit_id: commitId,
                path,
                side,
                line: startLine
            });
        }
        else {
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: prNumber,
                body,
                commit_id: commitId,
                path,
                start_side : side,
                side,
                start_line: startLine,
                line
            });
        }
    }

    /**
     * Lists all comments in a pull request with pagination support.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Array>} The list of all comments.
     */
    async listPRComments(owner, repo, prNumber) {
        core.info(`listPRComments()`);
        return await this.getAllPaginatedItems(
            this.octokit.rest.issues.listComments,
            { owner, repo, issue_number: prNumber }
        );
    }

    /**
     * Gets all commits in a pull request with pagination support.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Array>} The list of all commits.
     */
    async listPRCommits(owner, repo, prNumber) {
        core.info(`listPRCommits()`);
        return await this.getAllPaginatedItems(
            this.octokit.rest.pulls.listCommits,
            { owner, repo, pull_number: prNumber }
        );
    }

    /**
     * Gets changed files between two commits.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {string} baseCommit - The base commit SHA.
     * @param {string} headCommit - The head commit SHA.
     * @returns {Promise<Array>} The list of changed files.
     */
    async getFilesBetweenCommits(owner, repo, baseCommit, headCommit) {
        core.info(`getFilesBetweenCommits(${baseCommit}, ${headCommit})`);
        const { data: comparison } = await this.octokit.rest.repos.compareCommits({
            owner,
            repo,
            base: baseCommit,
            head: headCommit,
        });
        return comparison.files || [];
    }
}

module.exports = GitHubAPI;

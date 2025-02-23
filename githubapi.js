const github = require("@actions/github");

class GitHubAPI {
    constructor(token) {
        this.octokit = github.getOctokit(token);
    }

    /**
     * Handles errors by logging and throwing them.
     * @param {Error} error - The error to handle.
     * @param {string} message - The custom error message.
     */
    handleError(error, message) {
        console.error(message, error);
        throw new Error(`${message}: ${error.message}`);
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
        try {
            const { data: diff } = await this.octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: baseBranchName,
                head: headBranchName,
            });
            return diff;
        } catch (error) {
            this.handleError(error, 'Error comparing commits');
        }
    }

    /**
     * Retrieves a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Object>} The pull request data.
     */
    async getPullRequest(owner, repo, prNumber) {
        try {
            const { data: prData } = await this.octokit.rest.pulls.get({
                owner,
                repo,
                pull_number: prNumber,
            });
            return prData;
        } catch (error) {
            this.handleError(error, 'Error retrieving pull request');
        }
    }

    /**
     * Lists files changed in a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Array>} The list of changed files.
     */
    async listFiles(owner, repo, prNumber) {
        try {
            const { data: changedFiles } = await this.octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: prNumber,
            });
            return changedFiles;
        } catch (error) {
            this.handleError(error, 'Error listing changed files');
        }
    }

    /**
     * Retrieves the content of a file.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {string} filePath - The file path.
     * @param {string} ref - The reference (branch or commit SHA).
     * @returns {Promise<string>} The file content.
     */
    async getContent(owner, repo, filePath, ref) {
        try {
            const { data: fileContent } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref,
            });
            return Buffer.from(fileContent.content, "base64").toString("utf-8");
        } catch (error) {
            this.handleError(error, 'Error retrieving file content');
        }
    }

    /**
     * Creates a comment on a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @param {string} body - The comment body.
     */
    async createPRComment(owner, repo, prNumber, body) {
        try {
            await this.octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body,
            });
        } catch (error) {
            this.handleError(error, 'Error creating comment');
        }
    }

    /**
     * Creates a review comment on a pull request.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} pull_number - The pull request number.
     * @param {string} commit_id - The commit ID.
     * @param {string} body - The comment body.
     * @param {string} path - The relative path to the file that necessitates a comment..
     * @param {string} side - In a split diff view, the side of the diff that the pull request's changes appear on. Can be LEFT or RIGHT. Use LEFT for deletions that appear in red. Use RIGHT for additions that appear in green or unchanged lines that appear in white and are shown for context. For a multi-line comment, side represents whether the last line of the comment range is a deletion or addition. For more information, see "Diff view options" in the GitHub Help documentation.
     * @param {number} line - The line number. The line of the blob in the pull request diff that the comment applies to. For a multi-line comment, the last line of the range that your comment applies to.
     * @param {number} start_line - The start line number. The first line of the range that your comment applies to. The start_line must precede the end line.
     */
    async createReviewComment(owner, repo, pull_number, commit_id, body, path, side, start_line, line) {
        try {
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number,
                body,
                commit_id,
                path,
                side,
                start_line,
                line
            });
        } catch (error) {
            this.handleError(error, 'Error creating review comment');
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
        try {
            const allComments = [];
            let page = 1;
            while (true) {
                const { data: comments } = await this.octokit.rest.issues.listComments({
                    owner,
                    repo,
                    issue_number: prNumber,
                    per_page: 100,
                    page,
                });
                
                allComments.push(...comments);
                
                if (comments.length < 100) break;
                page++;
            }
            return allComments;
        } catch (error) {
            this.handleError(error, 'Error listing PR comments');
        }
    }

    /**
     * Gets all commits in a pull request with pagination support.
     * @param {string} owner - The repository owner.
     * @param {string} repo - The repository name.
     * @param {number} prNumber - The pull request number.
     * @returns {Promise<Array>} The list of all commits.
     */
    async listPRCommits(owner, repo, prNumber) {
        try {
            const allCommits = [];
            let page = 1;
            while (true) {
                const { data: commits } = await this.octokit.rest.pulls.listCommits({
                    owner,
                    repo,
                    pull_number: prNumber,
                    per_page: 100,
                    page,
                });
                
                allCommits.push(...commits);
                
                if (commits.length < 100) break;
                page++;
            }
            return allCommits;
        } catch (error) {
            this.handleError(error, 'Error listing PR commits');
        }
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
        try {
            const { data: comparison } = await this.octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: baseCommit,
                head: headCommit,
            });
            return comparison.files || [];
        } catch (error) {
            this.handleError(error, 'Error comparing commits');
        }
    }
}

module.exports = GitHubAPI;

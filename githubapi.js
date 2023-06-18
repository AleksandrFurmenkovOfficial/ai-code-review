const github = require("@actions/github");

class GitHubAPI {
    constructor(token) {
        this.octokit = github.getOctokit(token);
    }

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
            throw new Error(`Error comparing commits: ${error.message}`);
        }
    }

    async getPullRequest(owner, repo, prNumber) {
        try {
            const { data: prData } = await this.octokit.rest.pulls.get({
                owner,
                repo,
                pull_number: prNumber,
            });
            return prData;
        } catch (error) {
            throw new Error(`Error retrieving pull request: ${error.message}`);
        }
    }

    async listFiles(owner, repo, prNumber) {
        try {
            const { data: changedFiles } = await this.octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: prNumber,
            });
            return changedFiles;
        } catch (error) {
            throw new Error(`Error listing changed files: ${error.message}`);
        }
    }

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
            throw new Error(`Error retrieving file content: ${error.message}`);
        }
    }

    async createPRComment(owner, repo, prNumber, body) {
        try {
            await this.octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body,
            });
        } catch (error) {
            throw new Error(`Error creating comment: ${error.message}`);
        }
    }

    async createReviewComment(owner, repo, pull_number, commit_id, body, path, line) {
        try {
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number,
                body,
                commit_id,
                path,
                line,
            });
        } catch (error) {
            throw new Error(`Error creating review comment: ${error.message}`);
        }
    }
}

module.exports = GitHubAPI;

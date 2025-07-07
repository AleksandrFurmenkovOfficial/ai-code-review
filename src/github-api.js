const github = require("@actions/github");
const core = require("./core-wrapper");
const { MAX_FILE_SIZE_BYTES } = require("./constants");

class GitHubAPI {
    constructor(token) {
        this.octokit = github.getOctokit(token);
    }

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
     * Retrieves the content of a file and determines whether to show it as text
     * or mark it as binary.  The logic prefers hard information returned by
     * GitHub (diff patch / metadata) and avoids ad-hoc heuristics.
     */
    async getContent(owner, repo, baseRef, actualRef, filePath) {
        core.info(`getContent(${baseRef}, ${actualRef}, ${filePath})`);

        try {
            const { data: fileMetadata } = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: filePath,
                ref: actualRef,
            });

            // ─────────────  handle directories & non-files  ─────────────
            if (Array.isArray(fileMetadata)) {
                const directoryContent = fileMetadata
                    .map(item => `${item.name}${item.type === "dir" ? "/" : ""}`)
                    .join(", ");
                return `[Directory content: ${directoryContent}]`;
            }
            if (fileMetadata.type !== "file") {
                return `[${fileMetadata.type} not shown]`;
            }

            // ─────────────  guard on gigantic files  ─────────────
            if (fileMetadata.size && fileMetadata.size > MAX_FILE_SIZE_BYTES) {
                core.warning(
                    `File ${filePath} is too large (${fileMetadata.size} bytes), skipping review`
                );
                return `[File too large (${Math.round(fileMetadata.size / 1024)}KB) - skipped for review]`;
            }

            // ─────────────  text / binary decision  ─────────────
            let isTextFile;

            // 1.  If the file is part of the diff, trust the presence / absence of "patch".
            try {
                const { data: comparison } =
                    await this.octokit.rest.repos.compareCommits({
                        owner,
                        repo,
                        base: baseRef,
                        head: actualRef,
                    });

                const diffEntry = comparison.files.find(
                    f => f.filename === filePath
                );

                if (diffEntry) {
                    isTextFile = diffEntry.patch !== undefined;
                }
            } catch (err) {
                // Failure here is not fatal; we’ll fall back to metadata check below
                core.warning(`Diff check failed: ${err.message}`);
            }

            // 2.  If the file was NOT in the diff (unchanged) or diff lookup failed,
            //     rely only on GitHub’s metadata: if content is returned and is not
            //     marked as truncated, we treat it as text. Otherwise — binary.
            if (isTextFile === undefined) {
                isTextFile =
                    !!fileMetadata.content &&
                    fileMetadata.encoding === "base64" &&
                    fileMetadata.truncated !== true;
            }

            if (!isTextFile) {
                return "[Binary file not shown in review]";
            }

            // ─────────────  return decoded content  ─────────────
            if (fileMetadata.content && fileMetadata.encoding === "base64") {
                return Buffer.from(fileMetadata.content, "base64").toString("utf-8");
            }
            return "[File content unavailable]";
        } catch (error) {
            core.error(`Error retrieving file content: ${error.message}`);
            return `[Error retrieving file content: ${error.message}]`;
        }
    }

    async createPRComment(owner, repo, prNumber, body) {
        core.info(`createPRComment(${body})`);
        await this.octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body,
        });
    }

    async createReviewComment(
        owner,
        repo,
        prNumber,
        commitId,
        body,
        path,
        side,
        startLine,
        line
    ) {
        core.info(
            `createReviewComment(${path}, ${side}, ${startLine}, ${line}): ${body}`
        );
        if (startLine === line) {
            core.info(
                `attempting to create a single line comment for line ${startLine}`
            );
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: prNumber,
                body,
                commit_id: commitId,
                path,
                side,
                line: startLine,
            });
        } else {
            await this.octokit.rest.pulls.createReviewComment({
                owner,
                repo,
                pull_number: prNumber,
                body,
                commit_id: commitId,
                path,
                start_side: side,
                side,
                start_line: startLine,
                line,
            });
        }
    }

    async listPRComments(owner, repo, prNumber) {
        core.info(`listPRComments()`);
        const comments = await this.octokit.paginate(
            this.octokit.rest.issues.listComments,
            { owner, repo, issue_number: prNumber }
        );
        return comments;
    }

    async listPRCommits(owner, repo, prNumber) {
        core.info(`listPRCommits()`);
        const commits = await this.octokit.paginate(
            this.octokit.rest.pulls.listCommits,
            { owner, repo, pull_number: prNumber }
        );
        return commits;
    }

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

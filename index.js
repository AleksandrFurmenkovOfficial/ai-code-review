const github = require("@actions/github");
const core = require("@actions/core");
const openai = require("openai");

const getFilteredChangedFiles = (changedFiles, file_extensions, exclude_paths) => {
    let filteredFiles = changedFiles;

    if (file_extensions) {
        const extensions = file_extensions.split(',').map((ext) => ext.trim());
        filteredFiles = filteredFiles.filter((file) =>
            extensions.some((ext) => file.filename.endsWith(ext))
        );
    }

    if (exclude_paths) {
        const paths = exclude_paths.split(',').map((path) => path.trim());
        filteredFiles = filteredFiles.filter((file) =>
            !paths.some((path) => file.filename.startsWith(path))
        );
    }

    return filteredFiles;
};

const getFileChanges = async (fileContent, octokit, owner, repo, filename, branchName, baseBranchName, around = 42) => {
    const { data: diff } = await octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: baseBranchName,
        head: branchName,
    });

    const fileDiff = diff.files.find((f) => f.filename === filename);
    if (!fileDiff) return "";

    const getChangedLineNumbers = (fileDiff) => {
        const diffLines = fileDiff.patch.split('\n');
        const changedLineNumbers = [];

        let currentLine = 0;
        for (const line of diffLines) {
            if (line.startsWith('@@')) {
                const match = line.match(/@@ -\d+(,\d+)? \+(\d+)(,\d+)? @@/);
                if (match) {
                    currentLine = parseInt(match[2], 10) - 1;
                }
            } else if (line.startsWith('+')) {
                changedLineNumbers.push(currentLine);
                currentLine++;
            } else if (!line.startsWith('-')) {
                currentLine++;
            }
        }

        return changedLineNumbers;
    };

    let changedLineNumbers = getChangedLineNumbers(fileDiff);
    const contentLines = fileContent.split('\n');
    const relevantLines = [];
    for (const lineNumber of changedLineNumbers) {
        const startLine = Math.max(lineNumber - around, 0);
        const endLine = Math.min(lineNumber + around, contentLines.length);

        for (let i = startLine; i < endLine; i++) {
            if (i === startLine && i !== 0)
            {
                relevantLines.push("...");
            }

            if (!relevantLines.includes(contentLines[i])) {
                relevantLines.push(contentLines[i]);
            }

            if (i === endLine - 1 && i !== contentLines.length - 1)
            {
                relevantLines.push("...");
            }
        }
    }
    
    return `File: ${filename}\n\n${relevantLines.join('\n')}\n\n`;
};

const getSimplifiedContent = async (filesWithContents, octokit, owner, repo, max_input, branchName, baseBranchName) => {
    let combinedFileContent = "";
    for (const filename in filesWithContents) {
        let content = filesWithContents[filename];
        const fileChanges = await getFileChanges(content, octokit, owner, repo, filename, branchName, baseBranchName);
        if ((combinedFileContent + fileChanges).length > max_input) {
            const fileChanges = await getFileChanges(content, octokit, owner, repo, filename, branchName, baseBranchName, 21);
            if ((combinedFileContent + fileChanges).length > max_input) {
                const fileChanges = await getFileChanges(content, octokit, owner, repo, filename, branchName, baseBranchName, 0);
                combinedFileContent += fileChanges;
            }
            else {
                combinedFileContent += fileChanges;
            }
        }
        else {
            combinedFileContent += fileChanges;
        }
    }
    return combinedFileContent;
};

const getFilesContent = async (filteredChangedFiles, octokit, owner, repo, branchName) => {
    let filesWithContents = {}
    for (const file of filteredChangedFiles) {
        const { data: fileContent } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: file.filename,
            ref: branchName,
        });

        const decodedContent = Buffer.from(fileContent.content, 'base64').toString('utf-8');
        filesWithContents[file.filename] = decodedContent;
    }
    return filesWithContents;
};

const main = async () => {
    try {
        const token = core.getInput('token', { required: true });
        const repo = core.getInput('repo', { required: true });
        const pr_number = core.getInput('pr_number', { required: true });        
        const owner = core.getInput('owner', { required: true });

        const file_extensions = core.getInput('file_extensions', { required: false });
        const exclude_paths = core.getInput('exclude_paths', { required: false });
        const octokit = new github.getOctokit(token);

        const { data: prData } = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: pr_number,
        });
        
        const branchName = prData.head.ref;
        const baseBranchName = prData.base.ref;

        const max_tokens = 4096;
        const max_symbols = max_tokens * 4;
        const one_fifth_in_symbols = (max_symbols / 5);
        const max_input_symbols = one_fifth_in_symbols * 4;
        const { data: changedFiles } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pr_number,
        });
        const filteredChangedFiles = getFilteredChangedFiles(changedFiles, file_extensions, exclude_paths);
        const filesWithContents = await getFilesContent(filteredChangedFiles, octokit, owner, repo, branchName);
        combinedFileContent = Object.values(filesWithContents).reduce((accumulator, currentContent) => {
            return accumulator + currentContent;
          }, "");
        
        if (combinedFileContent.length > max_input_symbols) {
            combinedFileContent = await getSimplifiedContent(filesWithContents, octokit, owner, repo, max_input_symbols, branchName, baseBranchName);
        }

        if (combinedFileContent.length > max_input_symbols) {
            // todo: file change by change mode
        }

        const GPT35TurboMessage = [
            { role: "system", content: "You are a senior developer who responsible for code-review. You should check a code in files that will specified further. You should find mistakes, typos and check logic. If all is ok then write 'All looks good.'" },
            {
                role: "user",
                content: combinedFileContent,
            }
        ];

        const openai_api_key = core.getInput('openai_api_key', { required: true });
        const openai_client = new openai.OpenAIApi(
            new openai.Configuration({ apiKey: openai_api_key })
        );

        let GPT35Turbo = async (message) => {
            const response = await openai_client.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: message,
            });

            return response.data.choices[0].message.content;
        };

        var comment = await GPT35Turbo(GPT35TurboMessage);
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pr_number,
            body: comment
        });

    } catch (error) {
        core.setFailed(error.message);
    }
}

main(); // test

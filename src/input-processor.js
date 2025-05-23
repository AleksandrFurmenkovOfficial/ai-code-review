const core = require("@actions/core");
const GitHubAPI = require("./github-api.js");
const OpenAIAgent = require("./openai-agent.js");
const AnthropicAgent = require("./anthropic-agent.js");
const GoogleAgent = require("./google-agent.js");
const DeepseekAgent = require("./deepseek-agent.js");
const OpenRouterAgent = require("./openrouter-agent.js")

const { AI_REVIEW_COMMENT_PREFIX, SUMMARY_SEPARATOR } = require('./constants');

class InputProcessor {
    constructor() {
        this._repo = null;
        this._owner = null;
        this._pullNumber = null;
        this._githubToken = null;
        this._aiProvider = null;
        this._apiKey = null;
        this._model = null;
        this._failAction = true;
        this._githubAPI = null;
        this._baseCommit = null;
        this._headCommit = null;
        this._filteredDiffs = [];
        this._fileContentGetter = null;
        this._fileCommentator = null;
    }
    
    async processInputs() {
        this._readInputs();
        this._validateInputs();
        await this._setupGitHubAPI();
        await this._processChangedFiles();
        this._setupReviewTools();
        return this;
    }
    
    _sanitizeInput(input, type = 'string') {
        if (input === null || input === undefined) {
            return type === 'string' ? '' : null;
        }
        
        if (type === 'string') {
            return String(input)
                .replace(/[^\x20-\x7E]/g, '')
                .trim();
        }
        
        if (type === 'number') {
            const num = Number(input);
            return isNaN(num) ? 0 : num;
        }
        
        if (type === 'boolean') {
            return Boolean(input);
        }
        
        if (type === 'path') {
            return String(input)
                .replace(/\.{2,}/g, '.')
                .replace(/[^\w\-./\\]/g, '_')
                .trim();
        }
        
        return input;
    }
    
    _readInputs() {
        this._repo = this._sanitizeInput(core.getInput("repo", { required: true, trimWhitespace: true }));
        this._owner = this._sanitizeInput(core.getInput("owner", { required: true, trimWhitespace: true }));
        this._pullNumber = parseInt(core.getInput("pr_number", { required: true, trimWhitespace: true }), 10);
        this._githubToken = this._sanitizeInput(core.getInput("token", { required: true, trimWhitespace: true }));
        this._aiProvider = this._sanitizeInput(core.getInput("ai_provider", { required: true, trimWhitespace: true }));
        this._apiKey = this._sanitizeInput(core.getInput(`${this._aiProvider}_api_key`, { required: true, trimWhitespace: true }));
        this._model = this._sanitizeInput(core.getInput(`${this._aiProvider}_model`, { required: true, trimWhitespace: true }));
        this._failAction = core.getInput("fail_action_if_review_failed", { required: false, trimWhitespace: true }).toLowerCase() === 'true';
        
        this._includeExtensions = this._sanitizeInput(core.getInput("include_extensions", { required: false }));
        this._excludeExtensions = this._sanitizeInput(core.getInput("exclude_extensions", { required: false }));
        this._includePaths = this._sanitizeInput(core.getInput("include_paths", { required: false }), 'path');
        this._excludePaths = this._sanitizeInput(core.getInput("exclude_paths", { required: false }), 'path');
        
        if (!this._includeExtensions) core.info("Using default: include all extensions");
        if (!this._excludeExtensions) core.info("Using default: exclude no extensions");
        if (!this._includePaths) core.info("Using default: include all paths");
        if (!this._excludePaths) core.info("Using default: exclude no paths");
    }
    
    _validateInputs() {
        if (!this._repo) throw new Error("Repository name is required.");
        if (!this._owner) throw new Error("Owner name is required.");
        if (!this._pullNumber || isNaN(this._pullNumber)) throw new Error("Pull request number must be a valid number.");
        if (!this._githubToken) throw new Error("GitHub token is required.");
        if (!this._aiProvider) throw new Error("AI provider is required.");
        if (!this._apiKey) throw new Error(`${this._aiProvider} API key is required.`);
        
        const supportedProviders = ['openai', 'anthropic', 'google', 'deepseek', 'openrouter'];
        if (!supportedProviders.includes(this._aiProvider)) {
            throw new Error(`Unsupported AI provider: ${this._aiProvider}. Supported providers: ${supportedProviders.join(', ')}`);
        }
    }
    
    async _setupGitHubAPI() {
        this._githubAPI = new GitHubAPI(this._githubToken);
        const pullRequestData = await this._githubAPI.getPullRequest(this._owner, this._repo, this._pullNumber);
        this._headCommit = pullRequestData.head.sha;
        this._baseCommit = pullRequestData.base.sha;
    }
    
    async _processChangedFiles() {
        const comments = await this._githubAPI.listPRComments(this._owner, this._repo, this._pullNumber);
        const lastReviewComment = [...comments].reverse()
            .find(comment => comment.body && comment.body.startsWith(AI_REVIEW_COMMENT_PREFIX));
        
        let changedFiles;
        
        if (lastReviewComment) {
            core.info(`Found last review comment: ${lastReviewComment.body.split('\n')[0]}`);
            
            let newBaseCommit = lastReviewComment.body
                .split(SUMMARY_SEPARATOR)[0]
                .replace(AI_REVIEW_COMMENT_PREFIX, '')
                .split(' ')[0];

            let isNewBaseFound = (newBaseCommit && typeof newBaseCommit === 'string' && newBaseCommit.trim() !== '');
            if (isNewBaseFound){
                core.info(`New base commit ${newBaseCommit}. Incremental review will be performed`);
                this._baseCommit = newBaseCommit;
            }

        } else {
            core.info(`No previous review comments found, reviewing all files in PR`);
        }
            
        changedFiles = await this._githubAPI.getFilesBetweenCommits(
            this._owner,
            this._repo,
            this._baseCommit,
            this._headCommit
        );
        
        this._filteredDiffs = this._getFilteredChangedFiles(
            changedFiles,
            this._includeExtensions,
            this._excludeExtensions,
            this._includePaths,
            this._excludePaths
        );
        
        core.info(`Found ${this._filteredDiffs.length} files to review`);
    }
    
    _getFilteredChangedFiles(changedFiles, includeExtensions, excludeExtensions, includePaths, excludePaths) {
        const stringToArray = (inputString) => {
            if (!inputString) return [];
            return inputString.split(',')
                .map(item => {
                    const normalized = item.trim().replace(/\\/g, '/');
                    if (normalized.startsWith('.')) {
                        return normalized;
                    }
                    return normalized.endsWith('/') ? normalized : normalized + '/';
                })
                .filter(Boolean);
        };
        
        const includeExtensionsArray = stringToArray(includeExtensions);
        const excludeExtensionsArray = stringToArray(excludeExtensions);
        const includePathsArray = stringToArray(includePaths);
        const excludePathsArray = stringToArray(excludePaths);
        
        const isFileToReview = (filename) => {
            const normalizedFilename = filename.replace(/\\/g, '/');
            
            const hasValidExtension = includeExtensionsArray.length === 0 || 
                includeExtensionsArray.some(ext => normalizedFilename.endsWith(ext));
            const hasExcludedExtension = excludeExtensionsArray.length > 0 && 
                excludeExtensionsArray.some(ext => normalizedFilename.endsWith(ext));
            
            const isInIncludedPath = includePathsArray.length === 0 || 
                includePathsArray.some(path => normalizedFilename.startsWith(path));
            const isInExcludedPath = excludePathsArray.length > 0 && 
                excludePathsArray.some(path => normalizedFilename.startsWith(path));
            
            return hasValidExtension && !hasExcludedExtension && isInIncludedPath && !isInExcludedPath;
        };
        
        return changedFiles.filter(file => isFileToReview(file.filename.replace(/\\/g, '/')));
    }
    
    _setupReviewTools() {
        this._fileContentGetter = async (filePath) => 
            await this._githubAPI.getContent(this._owner, this._repo, this._baseCommit, this._headCommit, filePath);
            
        this._fileCommentator = async (comment, filePath, side, startLineNumber, endLineNumber) => {
            await this._githubAPI.createReviewComment(
                this._owner,
                this._repo,
                this._pullNumber,
                this._headCommit,
                comment,
                filePath,
                side,
                startLineNumber,
                endLineNumber
            );
        };
    }
    
    getAIAgent() {
        let aiAgent;
        
        switch (this._aiProvider) {
            case 'openai':
                aiAgent = new OpenAIAgent(this._apiKey, this._fileContentGetter, this._fileCommentator, this._model);
                break;
            case 'anthropic':
                aiAgent = new AnthropicAgent(this._apiKey, this._fileContentGetter, this._fileCommentator, this._model);
                break;
            case 'google':
                aiAgent = new GoogleAgent(this._apiKey, this._fileContentGetter, this._fileCommentator, this._model);
                break;
            case 'deepseek':
                aiAgent = new DeepseekAgent(this._apiKey, this._fileContentGetter, this._fileCommentator, this._model);
                break;
            case 'openrouter':
                aiAgent = new OpenRouterAgent(this._apiKey, this._fileContentGetter, this._fileCommentator, this._model);
                break;
            default:
                throw new Error(`Unsupported AI provider: ${this._aiProvider}`);
        }
        
        return aiAgent;
    }
    
    get filteredDiffs() { return this._filteredDiffs; }
    get githubAPI() { return this._githubAPI; }
    get headCommit() { return this._headCommit; }
    get repo() { return this._repo; }
    get owner() { return this._owner; }
    get pullNumber() { return this._pullNumber; }
    get failAction() { return this._failAction; }
}

module.exports = InputProcessor;

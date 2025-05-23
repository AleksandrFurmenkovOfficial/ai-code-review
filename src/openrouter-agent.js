const OpenAIAgent = require("./openai-agent");

class OpenRouterAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, githubAPI, owner, repo, prHeadBranch) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://openrouter.ai/api/v1", githubAPI, owner, repo, prHeadBranch);
    }
}

module.exports = OpenRouterAgent;

const OpenAIAgent = require("./openai-agent");

class PerplexityAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent) {
        super(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent, "https://api.perplexity.ai/");
    }
}

module.exports = PerplexityAgent;

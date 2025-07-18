const OpenAIAgent = require("./openai-agent");

class PerplexityAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://api.perplexity.ai/");
    }
}

module.exports = PerplexityAgent;

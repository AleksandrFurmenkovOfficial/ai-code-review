const OpenAIAgent = require("./openai-agent");

class OpenRouterAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://openrouter.ai/api/v1");
    }
}

module.exports = OpenRouterAgent;

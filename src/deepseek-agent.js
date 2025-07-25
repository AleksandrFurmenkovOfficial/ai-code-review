const OpenAIAgent = require("./openai-agent");

class DeepseekAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent) {
        super(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent, "https://api.deepseek.com/");
    }
}

module.exports = DeepseekAgent;

const OpenAIAgent = require("./openai-agent");

class DeepseekAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://api.deepseek.com/");
    }
}

module.exports = DeepseekAgent;

const OpenAIAgent = require("./openai-agent");

class XAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent) {
        super(apiKey, fileContentGetter, fileCommentator, model, reviewRulesContent, "https://api.x.ai/v1/");
    }
}

module.exports = XAgent;

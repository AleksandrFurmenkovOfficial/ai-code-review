const OpenAIAgent = require("./openai-agent");

class XAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://api.x.ai/v1/");
    }
}

module.exports = XAgent;

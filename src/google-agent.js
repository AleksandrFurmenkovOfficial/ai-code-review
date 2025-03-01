const OpenAIAgent = require("./openai-agent");

class GoogleAgent extends OpenAIAgent {
    constructor(apiKey, fileContentGetter, fileCommentator, model) {
        super(apiKey, fileContentGetter, fileCommentator, model, "https://generativelanguage.googleapis.com/v1beta/openai/");
    }
}

module.exports = GoogleAgent;

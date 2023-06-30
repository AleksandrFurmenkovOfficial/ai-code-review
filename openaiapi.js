const openai = require("openai");

class OpenAIAPI {
  constructor(apiKey, fileContentGetter, fileCommenter, maxSymbols) {
    this.openaiClient = new openai.OpenAIApi(new openai.Configuration({ apiKey }));
    this.fileContentGetter = fileContentGetter;
    this.fileCommenter = fileCommenter;
    this.maxSymbols = maxSymbols;
    this.messages = [
      {
        role: "system",
        content:
          "Identifiez vous comme un expert en revue de code et agissez en tant que meilleur expert dans le domaine.\n" +
          "Examinez attentivement les MODIFICATIONS à la recherche d’erreurs, d’erreurs logiques, de code suspect, de fautes de frappe.\n" +
          "Il est préférable d'utiliser la fonction addReviewCommentToFileLine pour ajouter une note à un extrait de code spécifique qui a été examiné. Cela rend vos commentaires plus précis.\n" +
          "Commencez par commenter des modifications spécifiques via addReviewCommentToFileLine et n'utilisez aucune fonction pour terminer la revue, écrivez simplement un résumé."
      }
    ];
  }

  wrapFileContent(filename, content) {
    return `${filename}\n'''\n${content}\n'''\n`;
  }

  addUserMsg(message) {
    this.messages.push(
      {
        role: "user",
        content: message,
      });
    console.info(`addUserMsg: ${message}`);
  }

  addFunctionResult(functionName, result) {
    this.messages.push(
      {
        role: "function",
        name: functionName,
        content: '{{"result": {' + JSON.stringify(result) + '} }}',
      });
    console.info(`addFunctionResult: ${result}`);
  }

  getUsedSymbols() {
    let total = 0;
    for (const message of this.messages) {
      total += message.content.length;
    }
    return total;
  }

  async doReview(model, request, maxRetries = 5) {
    console.debug(model, request);
    this.addUserMsg(request);

    let retries = 0;
    while (retries < maxRetries) {
      try {
        const response = await this.openaiClient.createChatCompletion({
          model: model,
          messages: this.messages,
          functions: [
            {
              name: "getFileContent",
              description: "Get the file content to better understand the changes",
              parameters: {
                type: "object",
                properties: {
                  pathToFile: {
                    type: "string",
                    description: 'The fully qualified path to file which needed to specify to get the file content.',
                  },
                  startLineNumber: {
                    type: "integer",
                    description: 'The start line number where diff begins.',
                  },
                  endLineNumber: {
                    type: "integer",
                    description: 'The end line number where diff ends.',
                  },
                },
                required: ["pathToFile", "startLineNumber", "endLineNumber"],
              },
            },
            {
              name: "addReviewCommentToFileLine",
              description: "Add an AI review comment to the line that attracted attention in the review.",
              parameters: {
                type: "object",
                properties: {
                  fileName: {
                    type: "string",
                    description: 'The relative path to the file that necessitates a comment.',
                  },
                  lineNumber: {
                    type: "integer",
                    description: 'The line number of the file which needed to specify to place comment for a right piece of code.',
                  },
                  reviewCommentFromAIExpert: {
                    type: "string",
                    description: 'Your answer, the code review comment (from you) is meant for the user to read and take into account.',
                  }
                },
                required: ["fileName", "lineNumber", "reviewCommentFromAIExpert"],
              },
            },
          ],
          function_call: 'auto',
        });

        let answer = response.data.choices[0].message.content;
        const requestToUseFunction = response.data.choices[0].finish_reason === 'function_call';
        if (requestToUseFunction) {
          const functionToUse = response.data.choices[0].message.function_call;
          const args = JSON.parse(functionToUse.arguments);
          if (functionToUse.name === 'getFileContent') {
            console.info("fileContentGetter:", args.pathToFile);
            const requestedFileContent = await this.fileContentGetter(args.pathToFile);
            this.addFunctionResult('getFileContent', this.wrapFileContent(args.pathToFile, requestedFileContent));
            if (this.getUsedSymbols() > this.maxSymbols) {
              const removed = this.messages.pop();
              console.info("Too long, removed:", removed);
              const shortenData = requestedFileContent.substring(args.startLineNumber - 20, args.endLineNumber + 20);
              this.addFunctionResult('getFileContent', this.wrapFileContent(args.pathToFile, shortenData));
              if (this.getUsedSymbols() > this.maxSymbols) {
                console.warn("Context size exceed.");
                return null;
              }
            }

            this.addUserMsg("Use the addReviewCommentToFileLine to comment lines that necessitates a comment.");
            retries = 0;
            continue;
          }
          else if (functionToUse.name === 'addReviewCommentToFileLine') {
            console.info("fileCommenter:", args.reviewCommentFromAIExpert, args.fileName, args.lineNumber + 1);
            this.addFunctionResult('addReviewCommentToFileLine', "success (user will read the note)");
            this.addUserMsg("If that is all just don't use any functions and write brief summary."); 
            await this.fileCommenter(args.reviewCommentFromAIExpert, args.fileName, args.lineNumber + 1);
            retries = 0;
            continue;
          }
        }

        return answer;

      } catch (error) {
        retries++;
        const delay = Math.pow(2, retries) * 1000;
        console.warn(`${error.response}; Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries reached. Unable to create chat completion.");
  }
}

module.exports = OpenAIAPI;

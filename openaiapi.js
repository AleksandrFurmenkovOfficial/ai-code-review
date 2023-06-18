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
          "Identify code review experts and act as the best expert in the field.\n" +
          "Carefully review the CHANGES for mistakes, logical errors, suspicious code, typos.\n" +
          "It's preferable to use the addReviewCommentToFileLine function to add a note to a specific code snippet that has been reviewed. This makes your feedback more precise."
      }
    ];
  }

  wrapFileContent(filename, content) {
    return `${filename}\n'''\n${content}\n'''\n`;
  }

  addUserMsg(message) {
    console.info(`addUserMsg: ${message}`);
    this.messages.push(
      {
        role: "user",
        content: message,
      });
  }

  getUsedSymbols() {
    let total = 0;
    for (const message of this.messages) {
      total += message.content.length;
    }
    return total;
  }

  async doReview(model, request, maxRetries = 3) {
    console.debug(model, request);
    this.addUserMsg(request);

    let retries = 0;
    while (retries < maxRetries) {
      try {
        const response = await this.openaiClient.createChatCompletion({
          model: model,
          temperature: 0.2,
          messages: this.messages,
          functions: [
            {
              name: "getFileContent",
              description: "Get the file content to better understand the changes",
              parameters: {
                type: "object",
                properties: {
                  filename: {
                    type: "string",
                    description: 'The fully qualified file name which needed to specify to get the file content.',
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
                required: ["filename", "startLineNumber", "endLineNumber"],
              },
            },
            {
              name: "addReviewCommentToFileLine",
              description: "Add an AI review comment to the line that attracted attention in the review.",
              parameters: {
                type: "object",
                properties: {
                  filename: {
                    type: "string",
                    description: 'The relative path to the file that necessitates a comment.',
                  },
                  lineNumber: {
                    type: "integer",
                    description: 'You need to specify the line number in the file to place the comment correctly for the relevant piece of code.',
                  },
                  reviewCommentFromAIExpert: {
                    type: "string",
                    description: 'Your answer, the code review comment (from you) is meant for the user to read and take into account.',
                  }
                },
                required: ["filename", "lineNumber", "reviewCommentFromAIExpert"],
              },
            },
          ],
          function_call: 'auto',
        });

        let answer = response.data.choices[0].message?.content;
        const requestToUseFunction = response.data.choices[0].finish_reason === 'function_call';
        if (requestToUseFunction) {
          const functionToUse = response.data.choices[0].message?.function_call;
          const args = JSON.parse(functionToUse.arguments);
          if (functionToUse.name === 'getFileContent') {
            console.info("fileContentGetter:", args.filename);            
            const requestedFileContent = await this.fileContentGetter(args.filename);
            this.addUserMsg(requestedFileContent);
            if (this.getUsedSymbols() > this.maxSymbols) {
              const removed = this.messages.pop();
              console.info("Too long, removed:", removed);
              const shortenData = requestedFileContent.substring(args.startLineNumber - 20, args.endLineNumber + 20);
              this.addUserMsg(shortenData);
              if (this.getUsedSymbols() > this.maxSymbols) {
                console.warn("Context size exceed.");
                return null;
              }
            }

            this.addUserMsg("Use the addReviewCommentToFileLine to comment specific part of the code.");
            continue;
          }
          else if (functionToUse.name === 'addReviewCommentToFileLine') {
            console.info("fileCommenter:", args.reviewCommentFromAIExpert, args.filename, args.lineNumber);
            await this.fileCommenter(args.reviewCommentFromAIExpert, args.filename, args.lineNumber + 1);
            this.addUserMsg("Thank you for your feedback provided through addReviewCommentToFileLine. Do you have any other codes to review or a have summary to finish? Please avoid repetition.");
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

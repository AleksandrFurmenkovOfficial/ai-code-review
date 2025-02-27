const InputProcessor = require('./input-processor.js');
const core = require('@actions/core');
const { AI_REVIEW_COMMENT_PREFIX, SUMMARY_SEPARATOR } = require('./constants');

const main = async () => {
    const inputProcessor = new InputProcessor();

    try {
        await inputProcessor.processInputs();

        if (inputProcessor.filteredDiffs.length === 0) {
            core.info('No files to review');
            return;
        }
        
        const aiAgent = inputProcessor.getAIAgent();
        const reviewSummary = await aiAgent.doReview(inputProcessor.filteredDiffs);
        if (!reviewSummary || typeof reviewSummary !== 'string' || reviewSummary.trim() === '') {
            throw new Error('AI Agent did not return a valid review summary');
        }

        const commentBody = `${AI_REVIEW_COMMENT_PREFIX}${inputProcessor.headCommit}${SUMMARY_SEPARATOR}${reviewSummary}`;
        await inputProcessor.githubAPI.createPRComment(
            inputProcessor.owner, 
            inputProcessor.repo, 
            inputProcessor.pullNumber, 
            commentBody
        );

    } catch (error) {
        if (!inputProcessor?.failAction) {
            core.debug(error.stack);
            core.warning(error.message);
        } else {            
            core.debug(error.stack);
            core.error(error.message);
            core.setFailed(error);
        }
    }
};

main();

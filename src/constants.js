/**
 * Common constants used across the application
 */

// Comment prefix used to identify AI review comments
const AI_REVIEW_COMMENT_PREFIX = "AI review done up to commit: ";

// Separator for the summary section in review comments
const SUMMARY_SEPARATOR = "\n\n### AI Review Summary:\n";

// Maximum number of iterations for AI review process to prevent infinite loops
const MAX_REVIEW_ITERATIONS = 142;

// Maximum file size to review (in bytes)
const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB

// Number of lines to include before and after the specified range in file content
const LINE_SPAN = 20;

 // Maximum number of entries in the file cache
const MAX_CACHE_ENTRIES = 1000;

module.exports = {
    AI_REVIEW_COMMENT_PREFIX,
    SUMMARY_SEPARATOR,
    MAX_REVIEW_ITERATIONS,
    MAX_FILE_SIZE_BYTES,
    LINE_SPAN,
    MAX_CACHE_ENTRIES
};

const core = require("@actions/core");

const core_debug = {
    /**
     * Writes info to console
     * @param {string} message 
     */
    info: (message) => {
        console.log(`[INFO] ${message}`);
    },

    /**
     * Writes warning to console
     * @param {string} message 
     */
    warning: (message) => {
        console.warn(`[WARNING] ${message}`);
    },

    /**
     * Writes debug message to console
     * @param {string} message 
     */
    debug: (message) => {
        console.log(`[DEBUG] ${message}`);
    },

    /**
     * Writes error to console
     * @param {string} message 
     */
    error: (message) => {
        console.error(`[ERROR] ${message}`);
    },

    /**
     * Sets the action as failed and writes error to console
     * @param {string|Error} message 
     */
    setFailed: (message) => {
        const errorMessage = message instanceof Error ? message.message : message;
        console.error(`[FAILED] ${errorMessage}`);
        if (message instanceof Error && message.stack) {
            console.error(message.stack);
        }
        process.exitCode = 1;
    },

    /**
     * Gets an input value
     * @param {string} name 
     * @param {object} options 
     * @returns {string}
     */
    getInput: (name, options = {}) => {
        const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
        if (options.required && !val) {
            throw new Error(`Input required and not supplied: ${name}`);
        }
        return val.trim();
    },

    /**
     * Gets a boolean input value
     * @param {string} name 
     * @param {object} options 
     * @returns {boolean}
     */
    getBooleanInput: (name, options = {}) => {
        const trueValue = ['true', 'True', 'TRUE'];
        const falseValue = ['false', 'False', 'FALSE'];
        const val = core_debug.getInput(name, options);
        if (trueValue.includes(val)) {
            return true;
        }
        if (falseValue.includes(val)) {
            return false;
        }
        throw new TypeError(`Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
            `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``);
    },

    /**
     * Gets a multiline input value
     * @param {string} name 
     * @param {object} options 
     * @returns {string[]}
     */
    getMultilineInput: (name, options = {}) => {
        const inputs = core_debug.getInput(name, options)
            .split('\n')
            .filter(x => x !== '');
        return inputs;
    },

    /**
     * Sets an output value
     * @param {string} name 
     * @param {string} value 
     */
    setOutput: (name, value) => {
        console.log(`[OUTPUT] ${name}=${value}`);
    },

    /**
     * Sets a secret value
     * @param {string} _secret 
     */
    setSecret: (_secret) => {
        console.log(`[SECRET] ***`);
    },

    /**
     * Adds a path to PATH
     * @param {string} inputPath 
     */
    addPath: (inputPath) => {
        console.log(`[ADD_PATH] ${inputPath}`);
    },

    /**
     * Exports a variable
     * @param {string} name 
     * @param {string} val 
     */
    exportVariable: (name, val) => {
        console.log(`[EXPORT] ${name}=${val}`);
        process.env[name] = val;
    },

    /**
     * Writes to summary
     * @param {string} text 
     */
    summary: {
        addRaw: (text) => {
            console.log(`[SUMMARY] ${text}`);
            return core_debug.summary;
        },
        write: () => {
            console.log(`[SUMMARY] Writing summary...`);
            return Promise.resolve();
        }
    }
};

module.exports = process.env.GITHUB_ACTIONS ? core : core_debug;

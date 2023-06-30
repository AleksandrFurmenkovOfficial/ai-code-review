# AI Code Review

Perform code review using OpenAI ChatGPT on your GitHub repositories.

## Name

AI Code Review

## Description

Perform code review using OpenAI ChatGPT to analyze and provide feedback on your code. This GitHub Action helps improve the code quality by automatically reviewing pull requests, focusing on specified file extensions, and excluding specific paths.

## Inputs

***token*** - Required. The GitHub token. This token is used to authenticate and access your GitHub repository.

***openai_api_key*** - Required. The OpenAI API key. This key is needed to access OpenAI's ChatGPT API for code review.

***owner*** - Required. The repository owner's username.

***repo*** - Required. The name of the repository.

***pr_number*** - Required. The pull request number to review.

***file_extensions*** - Optional. A comma-separated list of file extensions to review (e.g., ".py,.js,.html"). If not provided, the action will review all file types.

***exclude_paths*** - Optional. A comma-separated list of paths to exclude from the review (e.g., "test/,docs/"). If not provided, the action will review all paths.

## Usage

To use this action, create a new .github/workflows/ai-code-review.yml file in your GitHub repository with the following content:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  ai_code_review:
    runs-on: ubuntu-latest

    steps:
    - name: AI Code Review
      uses: xonlly/ai-code-review@v0.2.2
      with:
        token: ${{ secrets.GITHUB_TOKEN }} # or your token with access to PRs, read for files and write for comments
        openai_api_key: ${{ secrets.OPENAI_API_KEY }} # You should have access to gpt-4-0613
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        #file_extensions: ".py,.js,.html" # for example
        #exclude_paths: "test/,docs/"     # for example
```

This action will run on every opened or updated pull request, and it will review only the specified file types and exclude the specified paths.

PS ***Written with GPT 3.5 turbo***

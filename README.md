# AI Code Review

Perform code review using OpenAI ChatGPT on your GitHub repositories.

## Description

Perform code review using OpenAI ChatGPT to analyze and provide feedback on your code. This GitHub Action helps improve the code quality by automatically reviewing pull requests, focusing on specified file extensions, and excluding specific paths.

## Inputs

***token*** - Required. This GitHub token is used for authentication and to access your GitHub repository.

***openai_api_key*** - Required. This key is necessary to access OpenAI's ChatGPT API for code review purposes.

***owner*** - Required. The username of the repository owner.

***repo*** - Required. The name of the repository.

***pr_number*** - Required. The number of the pull request that needs to be reviewed.

***include_extensions*** - Optional. A comma-separated list of file extensions to include in the review (e.g., ".py,.js,.html"). If not specified, the action will consider all file types.

***exclude_extensions*** - Optional. A comma-separated list of file extensions to exclude from the review.

***include_paths*** - Optional. A comma-separated list of directory paths to include in the review.

***exclude_paths*** - Optional. A comma-separated list of directory paths to exclude from the review (e.g., "test/,docs/"). If not specified, the action will consider all paths.

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v0.4.1
      with:
        token: ${{ secrets.GITHUB_TOKEN }} # Token for accessing PRs, file reading, and commenting capabilities
        openai_api_key: ${{ secrets.OPENAI_API_KEY }} # Access to the GPT-4 class model
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        include_extensions: ${{ steps.inputs.include_extensions }} # Optional, specify file types to include e.g., ".py,.js,.html"
        exclude_extensions: ${{ steps.inputs.exclude_extensions }} # Optional, specify file types to exclude
        include_paths: ${{ steps.inputs.include_paths }} # Optional, specify directories to include
        exclude_paths: ${{ steps.inputs.exclude_paths }} # Optional, specify directories to exclude

```

This action will run on every opened or updated pull request, and it will review only the specified file types and exclude the specified paths.

PS. ***Written with GPT-4-turbo***

# AI Code Review

Perform code review using various AI models (OpenAI, Google, Anthropic, Deepseek) on your GitHub repositories.

## Description

Perform code review using various AI models to analyze and provide feedback on your code. This GitHub Action helps improve the code quality by automatically reviewing pull requests, focusing on specified file extensions, and excluding specific paths.

## Inputs

***token*** - Required. This GitHub token is used for authentication and to access your GitHub repository.

***ai_provider*** - Required. The AI provider to use (openai, google, anthropic, or deepseek). Default is 'openai'.

***openai_api_key*** - Required if using OpenAI provider. This key is necessary to access OpenAI's API for code review purposes.

***openai_model*** - Optional. The OpenAI model name (e.g., gpt-4o, o3-mini). Default is 'gpt-4o'.

***google_api_key*** - Required if using Google provider. This key is necessary to access Google's API for code review purposes.

***google_model*** - Optional. The Google model name (e.g., gemini-2.0-flash-thinking-exp-01-21). Default is 'gemini-2.0-flash-thinking-exp-01-21'.

***anthropic_api_key*** - Required if using Anthropic provider. This key is necessary to access Anthropic's API for code review purposes.

***anthropic_model*** - Optional. The Anthropic model name (e.g., claude-3-5-sonnet-20241022). Default is 'claude-3-5-sonnet-20241022'.

***deepseek_api_key*** - Required if using Deepseek provider. This key is necessary to access Deepseek's API for code review purposes.

***deepseek_model*** - Optional. The Deepseek model name (e.g., deepseek-reasoner). Default is 'deepseek-reasoner'.

***owner*** - Required. The username of the repository owner.

***repo*** - Required. The name of the repository.

***pr_number*** - Required. The number of the pull request that needs to be reviewed.

***include_extensions*** - Optional. A comma-separated list of file extensions to include in the review (e.g., ".py,.js,.html"). If not specified, the action will consider all file types.

***exclude_extensions*** - Optional. A comma-separated list of file extensions to exclude from the review.

***include_paths*** - Optional. A comma-separated list of directory paths to include in the review.

***exclude_paths*** - Optional. A comma-separated list of directory paths to exclude from the review (e.g., "test/,docs/"). If not specified, the action will consider all paths.

***fail_action_if_review_failed*** - Optional. If set to true, the action fails when the review process fails. Default is 'false'.

## Usage Examples

Create a new `.github/workflows/ai-code-review.yml` file in your GitHub repository. Below are examples for different AI providers:

### OpenAI Example

```yaml
name: AI Code Review with OpenAI

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
        token: ${{ secrets.GITHUB_TOKEN }}
        ai_provider: 'openai'
        openai_api_key: ${{ secrets.OPENAI_API_KEY }}
        openai_model: 'gpt-4o'
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
```

### Google Example

```yaml
name: AI Code Review with Google

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
        token: ${{ secrets.GITHUB_TOKEN }}
        ai_provider: 'google'
        google_api_key: ${{ secrets.GOOGLE_API_KEY }}
        google_model: 'gemini-2.0-flash-thinking-exp-01-21'
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
```

### Anthropic Example

```yaml
name: AI Code Review with Anthropic

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
        token: ${{ secrets.GITHUB_TOKEN }}
        ai_provider: 'anthropic'
        anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
        anthropic_model: 'claude-3-5-sonnet-20241022'
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
```

### Deepseek Example

```yaml
name: AI Code Review with Deepseek

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
        token: ${{ secrets.GITHUB_TOKEN }}
        ai_provider: 'deepseek'
        deepseek_api_key: ${{ secrets.DEEPSEEK_API_KEY }}
        deepseek_model: 'deepseek-reasoner'
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
```

### Advanced Configuration Example

```yaml
name: AI Code Review with Advanced Settings

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
        token: ${{ secrets.GITHUB_TOKEN }}
        ai_provider: 'openai'
        openai_api_key: ${{ secrets.OPENAI_API_KEY }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        include_extensions: '.py,.js,.tsx'
        exclude_extensions: '.test.js'
        include_paths: 'src/,app/'
        exclude_paths: 'test/,docs/'
        fail_action_if_review_failed: 'true'
```

PS. ***Written with/by AIs***

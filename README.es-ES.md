

# AI Code Review
*es una GitHub Action que es un 90% generada por IAs.

## Descripción

Realiza revisiones de código utilizando varios modelos de IA de OpenAI, Anthropic, Google, X, Deepseek o Perplexity para analizar y brindar comentarios sobre tu código. Esta GitHub Action ayuda a mejorar la calidad del código al revisar automáticamente los pull requests, centrarse en extensiones de archivos específicas y excluir rutas particulares.

## Entradas

***token*** - Obligatorio. Este token de GitHub se utiliza para la autenticación y para acceder a tu repositorio de GitHub.

***owner*** - Obligatorio. El nombre de usuario del propietario del repositorio.

***repo*** - Obligatorio. El nombre del repositorio.

***pr_number*** - Obligatorio. El número del pull request que necesita ser revisado.

***ai_provider*** - Obligatorio. El proveedor de IA a utilizar { openai, anthropic, google, x, deepseek}. El valor predeterminado es 'openai'.

***openai_api_key*** - Obligatorio si se utiliza el proveedor OpenAI. Esta clave es necesaria para acceder a la API de OpenAI con fines de revisión de código.

***openai_model*** - Opcional. El nombre del modelo de OpenAI (por ejemplo, gpt-5.2, gpt-4o u o3(muy lento)). El valor predeterminado es 'gpt-5.2'.

***anthropic_api_key*** - Obligatorio si se utiliza el proveedor Anthropic. Esta clave es necesaria para acceder a la API de Anthropic con fines de revisión de código.

***anthropic_model*** - Opcional. El nombre del modelo de Anthropic (por ejemplo, claude-sonnet-4-5-20250929 o claude-opus-4-5-20251101). El valor predeterminado es 'claude-sonnet-4-5-20250929'.

***google_api_key*** - Obligatorio si se utiliza el proveedor Google. Esta clave es necesaria para acceder a la API de Google con fines de revisión de código.

***google_model*** - Opcional. El nombre del modelo de Google (por ejemplo, gemini-3-pro-preview o gemini-3-flash-preview). El valor predeterminado es 'gemini-3-flash-preview'.

***deepseek_api_key*** - Obligatorio si se utiliza el proveedor Deepseek. Esta clave es necesaria para acceder a la API de Deepseek con fines de revisión de código.

***deepseek_model*** - Opcional. El nombre del modelo de Deepseek (por ejemplo, deepseek-chat). El valor predeterminado es 'deepseek-chat'.

***x_api_key*** - Obligatorio si se utiliza el proveedor X. Esta clave es necesaria para acceder a la API de X con fines de revisión de código.

***x_model*** - Opcional. El nombre del modelo de Deepseek (por ejemplo, grok-4 o grok-4-1-fast-reasoning-latest). El valor predeterminado es 'grok-4'.

***perplexity_api_key*** - Obligatorio si se utiliza el proveedor Perplexity. Esta clave es necesaria para acceder a la API de Perplexity con fines de revisión de código.

***perplexity_model*** - Opcional. El nombre del modelo de Perplexity (por ejemplo, sonar, sonar-pro, r1-1776, sonar-reasoning-pro). El valor predeterminado es 'sonar-reasoning-pro'.

***include_extensions*** - Opcional. Una lista separada por comas de extensiones de archivos a incluir en la revisión (por ejemplo, ".py,.js,.html"). Si no se especifica, la acción considerará todos los tipos de archivos.

***exclude_extensions*** - Opcional. Una lista separada por comas de extensiones de archivos a excluir de la revisión.

***include_paths*** - Opcional. Una lista separada por comas de rutas de directorios a incluir en la revisión.

***exclude_paths*** - Opcional. Una lista separada por comas de rutas de directorios a excluir de la revisión (por ejemplo, "test/,docs/"). Si no se especifica, la acción considerará todas las rutas.

***fail_action_if_review_failed*** - Opcional. Si se establece en true, la acción fallará cuando el proceso de revisión falle. El valor predeterminado es 'false'.

***review_rules_file*** - Opcional. Ruta a un archivo en el repositorio que contiene reglas de revisión personalizadas para agregar al prompt del sistema de IA.

## Ejemplos de Uso

Crea un nuevo archivo `.github/workflows/ai-code-review.yml` en tu repositorio de GitHub. A continuación se muestran ejemplos para diferentes proveedores de IA:

### Ejemplo con OpenAI

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'openai'
        openai_api_key: ${{ secrets.OPENAI_API_KEY }}
        openai_model: 'gpt-5.2'
```

### Ejemplo con Anthropic

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'anthropic'
        anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
        anthropic_model: 'claude-sonnet-4-5-20250929'
```

### Ejemplo con Google

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'google'
        google_api_key: ${{ secrets.GOOGLE_API_KEY }}
        google_model: 'gemini-3-flash-preview'
```

### Ejemplo con Deepseek

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'deepseek'
        deepseek_api_key: ${{ secrets.DEEPSEEK_API_KEY }}
        deepseek_model: 'deepseek-chat'
```

### Ejemplo con X

```yaml
name: AI Code Review with X

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  ai_code_review:
    runs-on: ubuntu-latest
    steps:
    - name: AI Code Review
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'x'
        x_api_key: ${{ secrets.X_API_KEY }}
        x_model: 'grok-4'
```

### Ejemplo con Perplexity

```yaml
name: AI Code Review with Perplexity

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  ai_code_review:
    runs-on: ubuntu-latest
    steps:
    - name: AI Code Review
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}
        
        ai_provider: 'perplexity'
        perplexity_api_key: ${{ secrets.PERPLEXITY_API_KEY }}
        perplexity_model: 'sonar-reasoning-pro'
```

### Ejemplo de Configuración Avanzada

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
      uses: AleksandrFurmenkovOfficial/ai-code-review@v1.0
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        owner: ${{ github.repository_owner }}
        repo: ${{ github.event.repository.name }}
        pr_number: ${{ github.event.number }}

        ai_provider: 'openai'
        openai_api_key: ${{ secrets.OPENAI_API_KEY }}
        
        include_extensions: '.py,.js,.tsx'
        exclude_extensions: '.test.js'
        include_paths: 'src/,app/'
        exclude_paths: 'test/,docs/'
        fail_action_if_review_failed: 'true'
```

## Solución de Problemas

### Problemas Comunes

#### Problemas con las Claves API
- **Problema**: Mensaje de error sobre claves API inválidas
- **Solución**: Asegúrate de que tus claves API estén configuradas correctamente como secretos de GitHub y se pasen adecuadamente al flujo de trabajo.

#### Falla de la Acción por Tiempo de Espera (Timeout)
- **Problema**: La acción falla con un error de tiempo de espera
- **Solución**: 
  1. Intenta usar un modelo más simple o rápido
  2. Divide los PR grandes en ones más pequeños
  3. Usa las rutas include/exclude para limitar el alcance de la revisión

#### Error: "This model's maximum context length is exceeded"
- **Problema**: El modelo de IA no puede procesar todo el código proporcionado debido a limitaciones de tokens
- **Solución**: 
  1. Usa exclude_paths para omitir archivos grandes
  2. Usa include_extensions para centrarte solo en tipos de archivos críticos
  3. Realiza PR más pequeños con menos archivos modificados

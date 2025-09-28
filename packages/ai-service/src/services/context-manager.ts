import { promises as fs } from 'fs';
import path from 'path';
import { AIRequest, AIContext, ProjectStructure, FileNode } from '../types';

export class ContextManager {
  private contextCache: Map<string, AIContext> = new Map();
  private readonly maxCacheSize = 100;
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes

  async buildContext(request: AIRequest): Promise<AIContext> {
    const cacheKey = `${request.userId}_${request.context?.repositoryPath || 'default'}`;

    // Check cache first
    const cached = this.contextCache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return this.enhanceContext(cached, request);
    }

    // Build new context
    const context = await this.buildNewContext(request);

    // Cache the context
    this.setCache(cacheKey, context);

    return context;
  }

  private async buildNewContext(request: AIRequest): Promise<AIContext> {
    const context: AIContext = {
      workingDirectory: '/workspace',
      environment: {},
      previousCommands: [],
      fileContents: [],
      ...request.context,
    };

    // If repository path is provided, analyze the project
    if (context.repositoryPath) {
      try {
        context.projectStructure = await this.analyzeProject(context.repositoryPath);
        context.workingDirectory = context.repositoryPath;
      } catch (error) {
        console.error('Failed to analyze project:', error);
      }
    }

    // Load relevant files based on the request
    if (request.command) {
      const relevantFiles = await this.findRelevantFiles(
        context.workingDirectory || '/workspace',
        request.command
      );
      context.fileContents = await this.loadFileContents(relevantFiles);
    }

    return context;
  }

  private enhanceContext(baseContext: AIContext, request: AIRequest): AIContext {
    const enhanced = { ...baseContext };

    // Add command to previous commands
    if (request.command) {
      enhanced.previousCommands = [
        ...(enhanced.previousCommands || []).slice(-10), // Keep last 10 commands
        request.command,
      ];
    }

    // Update working directory if specified
    if (request.context?.workingDirectory) {
      enhanced.workingDirectory = request.context.workingDirectory;
    }

    // Merge environment variables
    if (request.context?.environment) {
      enhanced.environment = {
        ...enhanced.environment,
        ...request.context.environment,
      };
    }

    return enhanced;
  }

  private async analyzeProject(projectPath: string): Promise<ProjectStructure> {
    const structure: ProjectStructure = {
      root: projectPath,
      files: [],
    };

    try {
      // Detect package manager
      structure.packageManager = await this.detectPackageManager(projectPath);

      // Detect language and framework
      const { language, framework } = await this.detectLanguageAndFramework(projectPath);
      structure.language = language;
      structure.framework = framework;

      // Check for tests
      structure.hasTests = await this.hasTests(projectPath);

      // Check for CI
      structure.hasCi = await this.hasCI(projectPath);

      // Build file tree
      structure.files = await this.buildFileTree(projectPath);
    } catch (error) {
      console.error('Error analyzing project:', error);
    }

    return structure;
  }

  private async detectPackageManager(projectPath: string): Promise<'npm' | 'yarn' | 'pnpm' | undefined> {
    try {
      const files = await fs.readdir(projectPath);

      if (files.includes('pnpm-lock.yaml')) return 'pnpm';
      if (files.includes('yarn.lock')) return 'yarn';
      if (files.includes('package-lock.json')) return 'npm';
    } catch (error) {
      // Directory might not exist or be accessible
    }

    return undefined;
  }

  private async detectLanguageAndFramework(projectPath: string): Promise<{
    language?: string;
    framework?: string;
  }> {
    try {
      const files = await fs.readdir(projectPath);

      // Check for package.json
      if (files.includes('package.json')) {
        const packageJsonPath = path.join(projectPath, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

        const dependencies = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        // Detect framework
        if (dependencies.react) return { language: 'javascript', framework: 'react' };
        if (dependencies.vue) return { language: 'javascript', framework: 'vue' };
        if (dependencies.angular) return { language: 'javascript', framework: 'angular' };
        if (dependencies.next) return { language: 'javascript', framework: 'nextjs' };
        if (dependencies.svelte) return { language: 'javascript', framework: 'svelte' };
        if (dependencies.express) return { language: 'javascript', framework: 'express' };
        if (dependencies.fastify) return { language: 'javascript', framework: 'fastify' };

        // Check for TypeScript
        if (dependencies.typescript || files.includes('tsconfig.json')) {
          return { language: 'typescript', framework: undefined };
        }

        return { language: 'javascript', framework: undefined };
      }

      // Check for Python
      if (files.includes('requirements.txt') || files.includes('pyproject.toml') || files.includes('setup.py')) {
        return { language: 'python', framework: undefined };
      }

      // Check for Go
      if (files.includes('go.mod')) {
        return { language: 'go', framework: undefined };
      }

      // Check for Rust
      if (files.includes('Cargo.toml')) {
        return { language: 'rust', framework: undefined };
      }

      // Check for Java
      if (files.includes('pom.xml') || files.includes('build.gradle')) {
        return { language: 'java', framework: undefined };
      }

      // Check for C#
      if (files.some(f => f.endsWith('.csproj') || f.endsWith('.sln'))) {
        return { language: 'csharp', framework: undefined };
      }
    } catch (error) {
      console.error('Error detecting language and framework:', error);
    }

    return {};
  }

  private async hasTests(projectPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(projectPath);

      // Check for test directories
      const testDirs = ['test', 'tests', '__tests__', 'spec'];
      if (testDirs.some(dir => files.includes(dir))) {
        return true;
      }

      // Check for test files in root
      const testFiles = files.filter(file =>
        file.includes('.test.') ||
        file.includes('.spec.') ||
        file.includes('_test.') ||
        file.includes('_spec.')
      );

      return testFiles.length > 0;
    } catch (error) {
      return false;
    }
  }

  private async hasCI(projectPath: string): Promise<boolean> {
    try {
      const files = await fs.readdir(projectPath);

      // Check for CI configuration files
      const ciFiles = [
        '.github',
        '.gitlab-ci.yml',
        'azure-pipelines.yml',
        'bitbucket-pipelines.yml',
        'Jenkinsfile',
        '.travis.yml',
        '.circleci',
      ];

      return ciFiles.some(file => files.includes(file));
    } catch (error) {
      return false;
    }
  }

  private async buildFileTree(projectPath: string, maxDepth: number = 3): Promise<FileNode[]> {
    try {
      return await this.buildFileTreeRecursive(projectPath, '', 0, maxDepth);
    } catch (error) {
      console.error('Error building file tree:', error);
      return [];
    }
  }

  private async buildFileTreeRecursive(
    basePath: string,
    relativePath: string,
    depth: number,
    maxDepth: number
  ): Promise<FileNode[]> {
    if (depth >= maxDepth) {
      return [];
    }

    const fullPath = path.join(basePath, relativePath);
    const items = await fs.readdir(fullPath, { withFileTypes: true });

    const nodes: FileNode[] = [];

    for (const item of items) {
      // Skip hidden files and common ignore patterns
      if (this.shouldIgnoreFile(item.name)) {
        continue;
      }

      const itemPath = path.join(relativePath, item.name);
      const fullItemPath = path.join(basePath, itemPath);

      const node: FileNode = {
        name: item.name,
        path: itemPath,
        type: item.isDirectory() ? 'directory' : 'file',
      };

      if (item.isFile()) {
        try {
          const stats = await fs.stat(fullItemPath);
          node.size = stats.size;
        } catch (error) {
          // Ignore stat errors
        }
      } else if (item.isDirectory()) {
        node.children = await this.buildFileTreeRecursive(basePath, itemPath, depth + 1, maxDepth);
      }

      nodes.push(node);
    }

    return nodes.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private shouldIgnoreFile(name: string): boolean {
    const ignorePatterns = [
      /^\./,  // Hidden files
      /^node_modules$/,
      /^dist$/,
      /^build$/,
      /^coverage$/,
      /^\.git$/,
      /^\.svn$/,
      /^\.hg$/,
      /^\.vscode$/,
      /^\.idea$/,
      /^target$/,
      /^bin$/,
      /^obj$/,
    ];

    return ignorePatterns.some(pattern => pattern.test(name));
  }

  private async findRelevantFiles(workingDir: string, command: string): Promise<string[]> {
    const relevantFiles: string[] = [];

    try {
      // Extract file references from command
      const fileReferences = this.extractFileReferences(command);

      for (const fileRef of fileReferences) {
        const fullPath = path.isAbsolute(fileRef) ? fileRef : path.join(workingDir, fileRef);

        try {
          const stats = await fs.stat(fullPath);
          if (stats.isFile() && stats.size < 100000) { // Only include files < 100KB
            relevantFiles.push(fullPath);
          }
        } catch (error) {
          // File might not exist, skip it
        }
      }

      // If no specific files mentioned, include common important files
      if (relevantFiles.length === 0) {
        const commonFiles = [
          'package.json',
          'tsconfig.json',
          'README.md',
          'docker-compose.yml',
          'Dockerfile',
          '.env.example',
        ];

        for (const file of commonFiles) {
          const fullPath = path.join(workingDir, file);
          try {
            await fs.access(fullPath);
            relevantFiles.push(fullPath);
          } catch (error) {
            // File doesn't exist, skip it
          }
        }
      }
    } catch (error) {
      console.error('Error finding relevant files:', error);
    }

    return relevantFiles.slice(0, 10); // Limit to 10 files to avoid token limits
  }

  private extractFileReferences(command: string): string[] {
    const fileReferences: string[] = [];

    // Simple regex to find file-like references
    const patterns = [
      /\b[\w\-\.\/]+\.\w+\b/g,  // Files with extensions
      /["']([^"']*\.[\w]+)["']/g,  // Quoted file paths
    ];

    for (const pattern of patterns) {
      const matches = command.matchAll(pattern);
      for (const match of matches) {
        const file = match[1] || match[0];
        if (file && !file.includes(' ') && file.length < 100) {
          fileReferences.push(file);
        }
      }
    }

    return [...new Set(fileReferences)]; // Remove duplicates
  }

  private async loadFileContents(filePaths: string[]): Promise<Array<{ path: string; content: string }>> {
    const fileContents: Array<{ path: string; content: string }> = [];

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        fileContents.push({
          path: filePath,
          content: content.length > 10000 ? content.substring(0, 10000) + '\n... [truncated]' : content,
        });
      } catch (error) {
        console.error(`Failed to read file ${filePath}:`, error);
      }
    }

    return fileContents;
  }

  private isCacheValid(context: AIContext): boolean {
    // For now, always rebuild context to ensure freshness
    // In a production system, you might cache based on file modification times
    return false;
  }

  private setCache(key: string, context: AIContext): void {
    // Implement LRU cache
    if (this.contextCache.size >= this.maxCacheSize) {
      const firstKey = this.contextCache.keys().next().value;
      this.contextCache.delete(firstKey);
    }

    this.contextCache.set(key, {
      ...context,
      // Add timestamp for cache invalidation
      _timestamp: Date.now(),
    } as any);
  }

  clearCache(): void {
    this.contextCache.clear();
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.contextCache.size,
      maxSize: this.maxCacheSize,
    };
  }
}
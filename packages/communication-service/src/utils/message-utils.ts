import { IncomingMessage, MessageAttachment } from '../types';

export class MessageUtils {
  static extractMentions(text: string): string[] {
    const mentionPattern = /@([a-zA-Z0-9_-]+)/g;
    const mentions: string[] = [];
    let match;

    while ((match = mentionPattern.exec(text)) !== null) {
      mentions.push(match[1]);
    }

    return mentions;
  }

  static extractUrls(text: string): string[] {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    const urls: string[] = [];
    let match;

    while ((match = urlPattern.exec(text)) !== null) {
      urls.push(match[1]);
    }

    return urls;
  }

  static extractEmails(text: string): string[] {
    const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const emails: string[] = [];
    let match;

    while ((match = emailPattern.exec(text)) !== null) {
      emails.push(match[1]);
    }

    return emails;
  }

  static isReply(message: IncomingMessage): boolean {
    const replyIndicators = [
      /^re:/i,
      /^reply/i,
      /^response/i,
      message.metadata?.inReplyTo !== undefined,
      message.metadata?.references !== undefined,
    ];

    return replyIndicators.some(indicator =>
      typeof indicator === 'boolean' ? indicator : indicator.test(message.content)
    );
  }

  static extractCodeBlocks(text: string): Array<{ language?: string; code: string }> {
    const codeBlocks: Array<{ language?: string; code: string }> = [];

    // Extract fenced code blocks (```language\ncode\n```)
    const fencedPattern = /```(\w+)?\n([\s\S]*?)\n```/g;
    let match;

    while ((match = fencedPattern.exec(text)) !== null) {
      codeBlocks.push({
        language: match[1] || undefined,
        code: match[2],
      });
    }

    // Extract inline code blocks (`code`)
    const inlinePattern = /`([^`\n]+)`/g;
    while ((match = inlinePattern.exec(text)) !== null) {
      codeBlocks.push({
        code: match[1],
      });
    }

    return codeBlocks;
  }

  static removeCodeBlocks(text: string): string {
    return text
      .replace(/```[\w]*\n[\s\S]*?\n```/g, '[CODE_BLOCK]')
      .replace(/`[^`\n]+`/g, '[CODE]');
  }

  static extractFileReferences(text: string): Array<{ filename: string; path?: string }> {
    const fileReferences: Array<{ filename: string; path?: string }> = [];

    // Match file paths (relative and absolute)
    const pathPattern = /(?:\.\/|\/|~\/)?(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+/g;
    let match;

    while ((match = pathPattern.exec(text)) !== null) {
      const fullPath = match[0];
      const filename = fullPath.split('/').pop() || fullPath;

      fileReferences.push({
        filename,
        path: fullPath,
      });
    }

    // Match quoted filenames
    const quotedPattern = /["']([^"']*\.[a-zA-Z0-9]+)["']/g;
    while ((match = quotedPattern.exec(text)) !== null) {
      const filename = match[1];
      if (!fileReferences.some(ref => ref.filename === filename)) {
        fileReferences.push({ filename });
      }
    }

    return fileReferences;
  }

  static formatAttachmentSummary(attachments: MessageAttachment[]): string {
    if (attachments.length === 0) {
      return 'No attachments';
    }

    if (attachments.length === 1) {
      const att = attachments[0];
      return `1 attachment: ${att.filename} (${this.formatFileSize(att.size)})`;
    }

    const totalSize = attachments.reduce((sum, att) => sum + att.size, 0);
    return `${attachments.length} attachments (${this.formatFileSize(totalSize)} total)`;
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  static sanitizeForDisplay(text: string, maxLength: number = 200): string {
    // Remove potentially dangerous HTML/script content
    let sanitized = text
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '');

    // Truncate if too long
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }

    return sanitized.trim();
  }

  static extractPriority(text: string): 'low' | 'normal' | 'high' | 'urgent' {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('urgent') || lowerText.includes('emergency') || lowerText.includes('critical')) {
      return 'urgent';
    }

    if (lowerText.includes('high priority') || lowerText.includes('important') || lowerText.includes('asap')) {
      return 'high';
    }

    if (lowerText.includes('low priority') || lowerText.includes('when you can') || lowerText.includes('no rush')) {
      return 'low';
    }

    return 'normal';
  }

  static extractDeadline(text: string): Date | null {
    const datePatterns = [
      // Today, tomorrow, yesterday
      /\b(today|tomorrow|yesterday)\b/i,
      // Specific dates
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/,
      // Relative time
      /\bin\s+(\d+)\s+(minute|hour|day|week)s?\b/i,
      // By specific time
      /\bby\s+(\d{1,2}):?(\d{2})?\s*(am|pm)?\b/i,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        return this.parseRelativeDate(match[0]);
      }
    }

    return null;
  }

  private static parseRelativeDate(dateString: string): Date | null {
    const now = new Date();
    const lower = dateString.toLowerCase();

    if (lower.includes('today')) {
      return now;
    }

    if (lower.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }

    if (lower.includes('yesterday')) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    // Parse "in X minutes/hours/days"
    const relativeMatch = lower.match(/in\s+(\d+)\s+(minute|hour|day|week)s?/);
    if (relativeMatch) {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2];
      const future = new Date(now);

      switch (unit) {
        case 'minute':
          future.setMinutes(future.getMinutes() + amount);
          break;
        case 'hour':
          future.setHours(future.getHours() + amount);
          break;
        case 'day':
          future.setDate(future.getDate() + amount);
          break;
        case 'week':
          future.setDate(future.getDate() + (amount * 7));
          break;
      }

      return future;
    }

    return null;
  }

  static generateMessageId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `msg_${timestamp}_${random}`;
  }

  static isAutomatedMessage(message: IncomingMessage): boolean {
    const automatedIndicators = [
      /no.?reply/i,
      /automated/i,
      /auto.?generated/i,
      /system.?message/i,
      /notification/i,
    ];

    const senderIndicators = [
      /noreply/i,
      /automated/i,
      /system/i,
      /notifications?/i,
    ];

    return (
      automatedIndicators.some(pattern => pattern.test(message.content)) ||
      senderIndicators.some(pattern => pattern.test(message.from))
    );
  }

  static extractLanguageFromCode(codeBlock: string): string | null {
    // Try to detect language from code patterns
    const languagePatterns: Record<string, RegExp[]> = {
      javascript: [/\b(function|const|let|var|=>)\b/, /\brequire\(/, /\bmodule\.exports/],
      typescript: [/\binterface\b/, /\btype\s+\w+\s*=/, /:\s*(string|number|boolean)\b/],
      python: [/\bdef\s+\w+\(/, /\bimport\s+\w+/, /\bfrom\s+\w+\s+import/],
      java: [/\bpublic\s+class\b/, /\bpublic\s+static\s+void\s+main/],
      csharp: [/\busing\s+System/, /\bpublic\s+class\b/, /\bnamespace\b/],
      go: [/\bpackage\s+main/, /\bfunc\s+main\(/, /\bimport\s+"/],
      rust: [/\bfn\s+main\(/, /\buse\s+std::/, /\blet\s+mut\b/],
      sql: [/\bSELECT\b/i, /\bFROM\b/i, /\bWHERE\b/i, /\bINSERT\s+INTO\b/i],
      html: [/<html\b/, /<div\b/, /<script\b/],
      css: [/\{[^}]*:[^}]*\}/, /@media\b/, /\.[\w-]+\s*\{/],
      bash: [/^#!/, /\becho\b/, /\bls\b/, /\bcd\b/],
    };

    for (const [language, patterns] of Object.entries(languagePatterns)) {
      if (patterns.some(pattern => pattern.test(codeBlock))) {
        return language;
      }
    }

    return null;
  }

  static truncateMessage(message: string, maxLength: number = 280): string {
    if (message.length <= maxLength) {
      return message;
    }

    // Try to truncate at word boundary
    const truncated = message.substring(0, maxLength - 3);
    const lastSpaceIndex = truncated.lastIndexOf(' ');

    if (lastSpaceIndex > maxLength * 0.8) {
      return truncated.substring(0, lastSpaceIndex) + '...';
    }

    return truncated + '...';
  }
}
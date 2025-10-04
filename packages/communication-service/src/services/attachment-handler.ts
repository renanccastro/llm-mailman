import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { IncomingMessage, MessageAttachment } from '../types';
import { Constants } from '@ai-dev/shared';

export class AttachmentHandler {
  private uploadDir: string;
  private maxFileSize: number;
  private allowedMimeTypes: string[];

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || '/tmp/uploads';
    this.maxFileSize = Constants.MAX_FILE_SIZE;
    this.allowedMimeTypes = [...Constants.ALLOWED_FILE_TYPES];
  }

  async processAttachments(message: IncomingMessage): Promise<MessageAttachment[]> {
    if (!message.attachments || message.attachments.length === 0) {
      return [];
    }

    const processedAttachments: MessageAttachment[] = [];

    for (const attachment of message.attachments) {
      try {
        const processedAttachment = await this.processAttachment(attachment, message.userId);
        processedAttachments.push(processedAttachment);
      } catch (error) {
        console.error(`Failed to process attachment ${attachment.filename}:`, error);
        // Continue processing other attachments
      }
    }

    return processedAttachments;
  }

  private async processAttachment(
    attachment: MessageAttachment,
    userId?: string
  ): Promise<MessageAttachment> {
    // Validate file size
    if (attachment.size > this.maxFileSize) {
      throw new Error(`File ${attachment.filename} exceeds maximum size of ${this.maxFileSize} bytes`);
    }

    // Validate MIME type
    if (!this.allowedMimeTypes.includes(attachment.mimetype)) {
      throw new Error(`File type ${attachment.mimetype} is not allowed`);
    }

    // Sanitize filename
    const sanitizedFilename = this.sanitizeFilename(attachment.filename);

    // Create user-specific upload directory
    const userUploadDir = path.join(this.uploadDir, userId || 'anonymous');
    await fs.mkdir(userUploadDir, { recursive: true });

    // Generate unique filename to prevent conflicts
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}_${sanitizedFilename}`;
    const filePath = path.join(userUploadDir, uniqueFilename);

    // Save file to disk
    if (attachment.content) {
      await fs.writeFile(filePath, attachment.content);
    } else if (attachment.url) {
      // Download from URL if content is not available
      await this.downloadFile(attachment.url, filePath);
    } else {
      throw new Error('No content or URL provided for attachment');
    }

    // Process specific file types
    const processedPath = await this.processFileType(filePath, attachment.mimetype);

    // Generate file metadata
    const stats = await fs.stat(processedPath);

    return {
      ...attachment,
      filename: sanitizedFilename,
      localPath: processedPath,
      size: stats.size,
      url: this.generateFileUrl(processedPath),
    };
  }

  private async processFileType(filePath: string, mimetype: string): Promise<string> {
    switch (mimetype) {
      case 'image/jpeg':
      case 'image/jpg':
      case 'image/png':
        return await this.processImage(filePath);

      case 'application/pdf':
        return await this.processPDF(filePath);

      case 'text/plain':
      case 'application/json':
        return await this.processTextFile(filePath);

      default:
        return filePath; // No processing needed
    }
  }

  private async processImage(filePath: string): Promise<string> {
    try {
      const outputPath = filePath.replace(/\.(jpe?g|png)$/i, '_processed.jpg');

      await sharp(filePath)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      // Remove original if processing succeeded
      await fs.unlink(filePath);

      return outputPath;
    } catch (error) {
      console.error('Failed to process image:', error);
      return filePath; // Return original on error
    }
  }

  private async processPDF(filePath: string): Promise<string> {
    // For now, just validate the PDF and return as-is
    // In a full implementation, you might want to:
    // - Extract text content
    // - Generate thumbnails
    // - Validate PDF structure
    return filePath;
  }

  private async processTextFile(filePath: string): Promise<string> {
    try {
      // Read and validate text content
      const content = await fs.readFile(filePath, 'utf-8');

      // Basic validation for text files
      if (content.length === 0) {
        throw new Error('Text file is empty');
      }

      // Check for malicious content (basic check)
      if (this.containsMaliciousContent(content)) {
        throw new Error('File contains potentially malicious content');
      }

      return filePath;
    } catch (error) {
      console.error('Failed to process text file:', error);
      throw error;
    }
  }

  private async downloadFile(url: string, filePath: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await fs.writeFile(filePath, buffer);
    } catch (error) {
      console.error('Failed to download file:', error);
      throw error;
    }
  }

  private sanitizeFilename(filename: string): string {
    // Remove potentially dangerous characters
    const sanitized = filename
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();

    // Ensure filename is not empty and has reasonable length
    if (sanitized.length === 0) {
      return 'attachment';
    }

    if (sanitized.length > 100) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext).substring(0, 90);
      return name + ext;
    }

    return sanitized;
  }

  private containsMaliciousContent(content: string): boolean {
    // Basic checks for potentially malicious content
    const maliciousPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /data:.*base64/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /system\s*\(/gi,
    ];

    return maliciousPatterns.some(pattern => pattern.test(content));
  }

  private generateFileUrl(localPath: string): string {
    const relativePath = path.relative(this.uploadDir, localPath);
    return `${process.env.API_URL}/files/${encodeURIComponent(relativePath)}`;
  }

  async getAttachment(filePath: string): Promise<Buffer | null> {
    try {
      const fullPath = path.resolve(this.uploadDir, filePath);

      // Security check: ensure the path is within upload directory
      if (!fullPath.startsWith(path.resolve(this.uploadDir))) {
        throw new Error('Invalid file path');
      }

      const content = await fs.readFile(fullPath);
      return content;
    } catch (error) {
      console.error('Failed to get attachment:', error);
      return null;
    }
  }

  async deleteAttachment(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.resolve(this.uploadDir, filePath);

      // Security check: ensure the path is within upload directory
      if (!fullPath.startsWith(path.resolve(this.uploadDir))) {
        throw new Error('Invalid file path');
      }

      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      return false;
    }
  }

  async cleanupExpiredAttachments(maxAgeHours: number = 24): Promise<void> {
    try {
      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);

      const cleanupDirectory = async (dirPath: string): Promise<void> => {
        const items = await fs.readdir(dirPath, { withFileTypes: true });

        for (const item of items) {
          const itemPath = path.join(dirPath, item.name);

          if (item.isDirectory()) {
            await cleanupDirectory(itemPath);

            // Remove empty directories
            const remaining = await fs.readdir(itemPath);
            if (remaining.length === 0) {
              await fs.rmdir(itemPath);
            }
          } else {
            const stats = await fs.stat(itemPath);
            if (stats.mtime.getTime() < cutoffTime) {
              await fs.unlink(itemPath);
              console.info(`Deleted expired attachment: ${itemPath}`);
            }
          }
        }
      };

      await cleanupDirectory(this.uploadDir);
    } catch (error) {
      console.error('Failed to cleanup expired attachments:', error);
    }
  }

  async getUploadedFileInfo(filePath: string): Promise<{
    filename: string;
    size: number;
    mimetype: string;
    createdAt: Date;
  } | null> {
    try {
      const fullPath = path.resolve(this.uploadDir, filePath);

      // Security check
      if (!fullPath.startsWith(path.resolve(this.uploadDir))) {
        throw new Error('Invalid file path');
      }

      const stats = await fs.stat(fullPath);
      const filename = path.basename(fullPath);

      // Basic MIME type detection based on extension
      const ext = path.extname(filename).toLowerCase();
      const mimeTypeMap: Record<string, string> = {
        '.txt': 'text/plain',
        '.json': 'application/json',
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
      };

      return {
        filename,
        size: stats.size,
        mimetype: mimeTypeMap[ext] || 'application/octet-stream',
        createdAt: stats.birthtime,
      };
    } catch (error) {
      console.error('Failed to get file info:', error);
      return null;
    }
  }
}
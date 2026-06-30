import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export const GOOGLE_DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
export const GOOGLE_DOCS_MIME = 'application/vnd.google-apps.document';
export const GOOGLE_SHEETS_MIME = 'application/vnd.google-apps.spreadsheet';
export const GOOGLE_SLIDES_MIME = 'application/vnd.google-apps.presentation';

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  md5Checksum?: string | null;
  size?: string | null;
  modifiedTime?: string | null;
  webViewLink?: string | null;
  parents?: string[];
  parentId?: string | null;
  path: string;
}

export interface DriveDownloadedFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  extractedText?: string;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(private readonly config: ConfigService) {}

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    const clientId = this.config.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const refreshToken = this.config.get('GOOGLE_DRIVE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google Drive credentials not configured');
    }

    const res = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    this.accessToken = res.data.access_token;
    this.tokenExpiry = Date.now() + (res.data.expires_in - 60) * 1000;
    return this.accessToken;
  }

  extractFolderId(input?: string | null): string | null {
    if (!input) return null;
    const trimmed = input.trim();
    const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (folderMatch?.[1]) return folderMatch[1];

    const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openMatch?.[1]) return openMatch[1];

    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
    return null;
  }

  async getFolderMetadata(folderId: string): Promise<{ id: string; name: string; webViewLink?: string }> {
    const token = await this.getAccessToken();
    const res = await axios.get(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(folderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fields: 'id,name,mimeType,webViewLink',
        supportsAllDrives: true,
      },
    });
    if (res.data.mimeType !== GOOGLE_DRIVE_FOLDER_MIME) {
      throw new Error('Google Drive link is not a folder');
    }
    return { id: res.data.id, name: res.data.name, webViewLink: res.data.webViewLink };
  }

  async listFilesRecursive(folderId: string, basePath = ''): Promise<DriveFileInfo[]> {
    const folder = await this.getFolderMetadata(folderId);
    const rootPath = basePath || folder.name;
    return this.listFolderChildren(folder.id, rootPath);
  }

  async downloadForImport(file: Pick<DriveFileInfo, 'id' | 'name' | 'mimeType'>): Promise<DriveDownloadedFile> {
    if (file.mimeType === GOOGLE_DOCS_MIME) {
      const [textBuffer, pdfBuffer] = await Promise.all([
        this.exportFile(file.id, 'text/plain'),
        this.exportFile(file.id, 'application/pdf'),
      ]);
      return {
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        fileName: this.ensureExtension(file.name, 'pdf'),
        extractedText: textBuffer.toString('utf8'),
      };
    }

    if (file.mimeType === GOOGLE_SHEETS_MIME || file.mimeType === GOOGLE_SLIDES_MIME) {
      const pdfBuffer = await this.exportFile(file.id, 'application/pdf');
      return {
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        fileName: this.ensureExtension(file.name, 'pdf'),
      };
    }

    return {
      buffer: await this.downloadFile(file.id),
      mimeType: file.mimeType,
      fileName: file.name,
    };
  }

  private async listFolderChildren(folderId: string, currentPath: string): Promise<DriveFileInfo[]> {
    const token = await this.getAccessToken();
    const files: DriveFileInfo[] = [];
    let pageToken: string | undefined;

    do {
      const res = await axios.get('https://www.googleapis.com/drive/v3/files', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`,
          fields: 'nextPageToken,files(id,name,mimeType,md5Checksum,size,modifiedTime,webViewLink,parents)',
          pageSize: 1000,
          pageToken,
          spaces: 'drive',
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        },
      });

      for (const item of res.data.files ?? []) {
        const itemPath = `${currentPath}/${item.name}`;
        if (item.mimeType === GOOGLE_DRIVE_FOLDER_MIME) {
          files.push(...await this.listFolderChildren(item.id, itemPath));
        } else {
          files.push({
            id: item.id,
            name: item.name,
            mimeType: item.mimeType,
            md5Checksum: item.md5Checksum ?? null,
            size: item.size ?? null,
            modifiedTime: item.modifiedTime ?? null,
            webViewLink: item.webViewLink ?? null,
            parents: item.parents ?? [],
            parentId: folderId,
            path: itemPath,
          });
        }
      }

      pageToken = res.data.nextPageToken;
    } while (pageToken);

    return files;
  }

  private async downloadFile(fileId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const res = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        params: { supportsAllDrives: true },
      },
    );
    return Buffer.from(res.data);
  }

  private async exportFile(fileId: string, mimeType: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const res = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'arraybuffer',
        params: { mimeType },
      },
    );
    return Buffer.from(res.data);
  }

  private ensureExtension(name: string, ext: string): string {
    return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`;
  }

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folderPath: string,
  ): Promise<string | null> {
    try {
      const token = await this.getAccessToken();
      const rootFolderId = this.config.get('GOOGLE_DRIVE_FOLDER_ID');
      const targetFolderId = await this.ensureFolder(token, rootFolderId, folderPath);

      const metadata = { name: fileName, parents: [targetFolderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }));

      const res = await axios.post(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        form,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return res.data.id;
    } catch (err) {
      this.logger.warn(`Google Drive upload failed: ${err.message}`);
      return null;
    }
  }

  private async ensureFolder(
    token: string,
    parentId: string,
    folderPath: string,
  ): Promise<string> {
    const parts = folderPath.split('/').filter(Boolean);
    let currentParent = parentId;
    for (const part of parts) {
      const search = await axios.get(
        `https://www.googleapis.com/drive/v3/files?q=name='${part}' and '${currentParent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (search.data.files?.length > 0) {
        currentParent = search.data.files[0].id;
      } else {
        const create = await axios.post(
          'https://www.googleapis.com/drive/v3/files',
          { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [currentParent] },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
        );
        currentParent = create.data.id;
      }
    }
    return currentParent;
  }

  buildFolderPath(uploadStatus: 'official' | 'non-official', date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `LINE-OA-Uploads/${year}/${month}/${uploadStatus}`;
  }
}

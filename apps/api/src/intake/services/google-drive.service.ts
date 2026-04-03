import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    folderPath: string,
  ): Promise<string> {
    try {
      const token = await this.getAccessToken();
      const rootFolderId = this.config.get('GOOGLE_DRIVE_FOLDER_ID');
      const targetFolderId = await this.ensureFolder(token, rootFolderId, folderPath);

      const metadata = { name: fileName, parents: [targetFolderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', new Blob([buffer.buffer as ArrayBuffer], { type: mimeType }));

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

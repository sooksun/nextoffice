import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);
  private accessToken: string | null = null;
  private tokenExpiry = 0;

  constructor(private readonly config: ConfigService) {}

  private get calendarId(): string {
    return this.config.get('GOOGLE_CALENDAR_ID', 'primary');
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    const clientId = this.config.get('GOOGLE_DRIVE_CLIENT_ID');
    const clientSecret = this.config.get('GOOGLE_DRIVE_CLIENT_SECRET');
    const refreshToken = this.config.get('GOOGLE_DRIVE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google OAuth credentials not configured');
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

  async createDeadlineEvent(params: {
    summary: string;
    description?: string;
    dueDate: Date;
    attendeeEmails?: string[];
    caseId: number;
  }): Promise<string | null> {
    try {
      const token = await this.getAccessToken();

      const startDate = new Date(params.dueDate);
      startDate.setHours(9, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(10, 0, 0, 0);

      const event: any = {
        summary: params.summary,
        description: params.description || '',
        start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Bangkok' },
        end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Bangkok' },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 3 * 24 * 60 }, // 3 days before
            { method: 'popup', minutes: 24 * 60 },      // 1 day before
            { method: 'popup', minutes: 60 },            // 1 hour before
          ],
        },
        extendedProperties: {
          private: { nextoffice_case_id: String(params.caseId) },
        },
      };

      if (params.attendeeEmails?.length) {
        event.attendees = params.attendeeEmails.map((email) => ({ email }));
      }

      const res = await axios.post(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?sendUpdates=all`,
        event,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );

      this.logger.log(`Calendar event created: ${res.data.id} for case #${params.caseId}`);
      return res.data.id;
    } catch (err) {
      this.logger.warn(`Calendar event creation failed: ${err?.response?.data?.error?.message || err.message}`);
      return null;
    }
  }

  async updateEvent(eventId: string, updates: {
    summary?: string;
    description?: string;
    attendeeEmails?: string[];
    colorId?: string;
  }): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      const body: any = {};
      if (updates.summary) body.summary = updates.summary;
      if (updates.description) body.description = updates.description;
      if (updates.colorId) body.colorId = updates.colorId;
      if (updates.attendeeEmails) {
        body.attendees = updates.attendeeEmails.map((email) => ({ email }));
      }

      await axios.patch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?sendUpdates=all`,
        body,
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Calendar event update failed: ${err.message}`);
      return false;
    }
  }

  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      const token = await this.getAccessToken();
      await axios.delete(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Calendar event delete failed: ${err.message}`);
      return false;
    }
  }
}

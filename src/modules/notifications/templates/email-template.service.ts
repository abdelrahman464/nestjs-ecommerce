import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { EMAIL_TEMPLATES } from './email-templates';
import { EmailTemplateId } from './email-template-id.enum';
import {
  EmailTemplateVars,
  RenderedEmail,
} from './email-template.types';

@Injectable()
export class EmailTemplateService {
  constructor(
    @InjectPinoLogger(EmailTemplateService.name)
    private readonly logger: PinoLogger,
  ) {}

  render(templateId: EmailTemplateId, vars: EmailTemplateVars): RenderedEmail {
    const template = EMAIL_TEMPLATES[templateId];
    if (!template) {
      this.logger.error({ templateId }, 'Unknown email template');
      throw new Error(`Unknown email template: ${templateId}`);
    }

    return {
      subject: this.interpolate(template.subject, vars),
      text: this.interpolate(template.text, vars),
      html: this.interpolate(template.html, vars),
    };
  }

  /** Replaces {{key}} with vars[key]. Missing keys become empty string. */
  private interpolate(source: string, vars: EmailTemplateVars): string {
    return source.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
      const value = vars[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }
}

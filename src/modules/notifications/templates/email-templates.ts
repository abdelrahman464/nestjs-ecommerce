import { EmailTemplateId } from './email-template-id.enum';
import { EmailTemplateDefinition } from './email-template.types';

/**
 * Simple string templates. Placeholders: {{name}}, {{code}}, …
 * Keep HTML minimal — upgrade to Handlebars/MJML later if needed.
 */
export const EMAIL_TEMPLATES: Record<EmailTemplateId, EmailTemplateDefinition> =
  {
    /** Password reset email */
    /***************************************************************************/
    [EmailTemplateId.PASSWORD_RESET]: {
      subject: 'Password Reset Code',
      text: `Hi {{name}},

Your password reset code is: {{code}}

This code is valid for 10 minutes.

If you did not request this, you can ignore this email.`,
      html: `<p>Hi {{name}},</p>
<p>Your password reset code is: <strong>{{code}}</strong></p>
<p>This code is valid for 10 minutes.</p>
<p>If you did not request this, you can ignore this email.</p>`,
    },
    /***************************************************************************/
    /** Order confirmation email */
    /***************************************************************************/
    [EmailTemplateId.ORDER_CONFIRMATION]: {
      subject: 'Order confirmation #{{orderIdShort}}',
      text: `Hi {{name}},

Thank you for your purchase!

Order summary:
{{itemsList}}

Subtotal: {{subtotal}} {{currency}}
Delivery: {{deliveryFee}} {{currency}}
Total: {{total}} {{currency}}

We will process your order shortly.`,
      html: `<p>Hi {{name}},</p>
<p>Thank you for your purchase!</p>
<p><strong>Order summary</strong></p>
<pre>{{itemsList}}</pre>
<p>Subtotal: {{subtotal}} {{currency}}<br/>
Delivery: {{deliveryFee}} {{currency}}<br/>
<strong>Total: {{total}} {{currency}}</strong></p>
<p>We will process your order shortly.</p>`,
    },
    /***************************************************************************/
  };

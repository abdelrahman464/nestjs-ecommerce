export type EmailTemplateVars = Record<string, string | number>;

export type RenderedEmail = {
  subject: string;
  text: string;
  html: string;
};

export type EmailTemplateDefinition = {
  subject: string;
  text: string;
  html: string;
};

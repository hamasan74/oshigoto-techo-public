export interface MailRecipientSettings {
  to: string;
  cc: string;
}

export type MailPhaseKey = 'start' | 'end';

export interface MailTemplateContextTimeRange {
  startTime: string;
  endTime: string;
  label: string;
}

export interface MailTemplateContextTaskRow {
  dateLabel: string;
  projectCode: string;
  projectName: string;
  taskLabel: string;
  planHoursLabel: string;
  actualHoursLabel: string;
  planComment: string;
  actualComment: string;
  needsComment: boolean;
  workplaces: {
    plan: string;
    actual: string;
  };
}

export interface MailTemplateContextCommentRow {
  projectCode: string;
  projectName: string;
  planComment: string;
  actualComment: string;
  commentLabel: string;
  needsComment: boolean;
}

export interface MailTemplateContext {
  userId: string;
  userName: string;
  date: string;
  dateLabel: string;
  themeName: string;
  phaseKey: MailPhaseKey;
  phaseLabel: string;
  workplaceLabel: string;
  workTimes: {
    planned: MailTemplateContextTimeRange;
    actual: MailTemplateContextTimeRange;
  };
  plannedTimeLabel: string;
  actualTimeLabel: string;
  taskRows: MailTemplateContextTaskRow[];
  commentRows: MailTemplateContextCommentRow[];
}

export interface BoardMailDraft {
  templateId: string;
  templateLabel: string;
  phaseKey: MailPhaseKey;
  phaseLabel: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export interface MailSendPreview extends BoardMailDraft {
  to: string;
  cc: string;
}

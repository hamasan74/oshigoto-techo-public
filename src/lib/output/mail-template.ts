import type { BoardMailDraft, MailPhaseKey, MailTemplateContext } from '../../types/mail';
import type { DailyOutputViewModel } from './view-model';
import {
  buildDefaultMailSubject,
  formatMailDraftFromTemplate,
  type RenderedMailTemplateContent,
} from './mail-formatter';

interface MailTemplateDefinition {
  id: string;
  label: string;
  matchUserId?: (userId: string) => boolean;
  render?: (context: MailTemplateContext) => Partial<RenderedMailTemplateContent>;
}

function resolveMailPhaseKey(phaseLabel: string): MailPhaseKey {
  return phaseLabel === '開始' ? 'start' : 'end';
}

const defaultMailTemplate: MailTemplateDefinition = {
  id: 'default-work-notice',
  label: '標準勤務連絡',
  render: (context) => ({
    subject: buildDefaultMailSubject(context),
  }),
};

const mailTemplateRegistry: MailTemplateDefinition[] = [defaultMailTemplate];

export function buildMailTemplateContext(params: {
  userId: string;
  themeName: string;
  viewModel: DailyOutputViewModel;
}): MailTemplateContext {
  const { userId, viewModel } = params;

  return {
    userId: userId.trim(),
    userName: viewModel.userName,
    date: viewModel.date,
    dateLabel: viewModel.dateLabel,
    themeName: params.themeName,
    phaseKey: resolveMailPhaseKey(viewModel.workInfo.phaseLabel),
    phaseLabel: viewModel.workInfo.phaseLabel,
    workplaceLabel: viewModel.workInfo.workplaceLabel,
    workTimes: {
      planned: {
        startTime: viewModel.workInfo.plannedTime.startTime,
        endTime: viewModel.workInfo.plannedTime.endTime,
        label: viewModel.workInfo.plannedTime.label,
      },
      actual: {
        startTime: viewModel.workInfo.actualTime.startTime,
        endTime: viewModel.workInfo.actualTime.endTime,
        label: viewModel.workInfo.actualTime.label,
      },
    },
    plannedTimeLabel: viewModel.workInfo.plannedTime.label,
    actualTimeLabel: viewModel.workInfo.actualTime.label,
    taskRows: viewModel.taskRows.map((row) => ({
      dateLabel: row.dateLabel,
      projectCode: row.projectCode,
      projectName: row.projectName,
      taskLabel: row.taskLabel,
      planHoursLabel: row.planHoursLabel,
      actualHoursLabel: row.actualHoursLabel,
      planComment: row.planNote,
      actualComment: row.actualNote,
      needsComment: row.needsComment,
      workplaces: row.workplaces,
    })),
    commentRows: viewModel.commentRows.map((row) => ({
      projectCode: row.projectCode,
      projectName: row.projectName,
      planComment: row.planComment,
      actualComment: row.actualComment,
      commentLabel: row.commentLabel,
      needsComment: row.needsComment,
    })),
  };
}

export function resolveMailTemplate(context: MailTemplateContext) {
  return (
    mailTemplateRegistry.find((template) => template.matchUserId?.(context.userId) ?? false) ??
    defaultMailTemplate
  );
}

export function buildBoardMailDraftFromTemplateContext(context: MailTemplateContext): BoardMailDraft {
  const template = resolveMailTemplate(context);
  const rendered = formatMailDraftFromTemplate(context, template.render?.(context));

  return {
    templateId: template.id,
    templateLabel: template.label,
    phaseKey: context.phaseKey,
    phaseLabel: context.phaseLabel,
    subject: rendered.subject,
    htmlBody: rendered.htmlBody,
    textBody: rendered.textBody,
  };
}

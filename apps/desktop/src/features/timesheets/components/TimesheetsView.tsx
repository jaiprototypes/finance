import { TimeEntriesSection } from "./sections/TimeEntriesSection";
import { TimeEntryEditorSection } from "./sections/TimeEntryEditorSection";
import { TimeInvoiceSection } from "./sections/TimeInvoiceSection";
import { TimesheetProjectSetupSection } from "./sections/TimesheetProjectSetupSection";
import { TimesheetSummarySection } from "./sections/TimesheetSummarySection";
import { TimesheetTimerSection } from "./sections/TimesheetTimerSection";
import { TimesheetWeeklyRollupSection } from "./sections/TimesheetWeeklyRollupSection";

export function TimesheetsView({ model }: { model: any }) {
  const { SectionHeader } = model;

  return (
    <div className="page">
      <SectionHeader title="Projects + Time" subtitle="Track projects, weekly timesheets, and billable hours." />
      <TimesheetSummarySection model={model} />
      <TimesheetProjectSetupSection model={model} />
      <TimesheetTimerSection model={model} />
      <TimeEntryEditorSection model={model} />
      <TimeEntriesSection model={model} />
      <TimesheetWeeklyRollupSection model={model} />
      <TimeInvoiceSection model={model} />
    </div>
  );
}

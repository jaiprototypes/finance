export function TimesheetReportSection({ model }: { model: any }) {
  const { BoxTitle, formatAmount, timesheetSummary } = model;

  return (
    <div className="panel">
      <BoxTitle title="Timesheets summary" />
      {timesheetSummary && (
        <>
          <p>Total hours: {timesheetSummary.total_hours || 0}</p>
          <p>Billable hours: {timesheetSummary.billable_hours || 0}</p>
          <p>Non-billable hours: {timesheetSummary.non_billable_hours || 0}</p>
          <p>Effective hourly rate: {formatAmount(timesheetSummary.effective_hourly_rate)}</p>
        </>
      )}
    </div>
  );
}

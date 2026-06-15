export function TimesheetWeeklyRollupSection({ model }: { model: any }) {
  const { BoxTitle, CollapsibleSection, formatCount, formatHours, weeklyRows, weeklySummary } = model;

  return (
    <CollapsibleSection
      title="Weekly rollup"
      summary={weeklySummary}
      defaultOpen={false}
    >
      <div className="panel">
        <BoxTitle title="Weekly timesheet" />
        {weeklyRows.length === 0 ? (
          <p className="muted">Log time entries to generate weekly timesheets.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Week of</th>
                <th>Entries</th>
                <th>Total hours</th>
                <th>Billable hours</th>
              </tr>
            </thead>
            <tbody>
              {weeklyRows.map((row: any) => (
                <tr key={`week-${row.week}`}>
                  <td>{row.week}</td>
                  <td>{formatCount(row.entries.length)}</td>
                  <td>{formatHours(row.totalMinutes)}</td>
                  <td>{formatHours(row.billableMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </CollapsibleSection>
  );
}

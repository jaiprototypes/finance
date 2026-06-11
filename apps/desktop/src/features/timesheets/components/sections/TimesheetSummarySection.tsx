export function TimesheetSummarySection({ model }: { model: any }) {
  const {
    BoxTitle,
    activeEntry,
    billableMinutes,
    formatCount,
    formatHours,
    projectSummary,
    selectedEntryCount,
    totalMinutes
  } = model;

  return (
    <div className="panel">
      <BoxTitle title="Projects tracker" />
      <div className="row">
        <span className="pill">Total hours {formatHours(totalMinutes)}</span>
        <span className="pill">Billable hours {formatHours(billableMinutes)}</span>
        <span className="pill">Active timer {activeEntry ? "Running" : "Idle"}</span>
        <span className="pill">Selected for invoice {formatCount(selectedEntryCount)}</span>
      </div>
      {projectSummary.length === 0 ? (
        <p className="muted">Create a project to track progress.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Rate</th>
              <th>Total hours</th>
              <th>Billable hours</th>
            </tr>
          </thead>
          <tbody>
            {projectSummary.map((project: any) => (
              <tr key={`summary-${project.id}`}>
                <td>{project.name}</td>
                <td>{project.client}</td>
                <td>{project.hourly_rate}</td>
                <td>{formatHours(project.minutes)}</td>
                <td>{formatHours(project.billable)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

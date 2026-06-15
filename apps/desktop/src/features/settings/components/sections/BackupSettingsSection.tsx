export function BackupSettingsSection({ model }: { model: any }) {
  const {
    BoxTitle,
    formatFileSize,
    dbPath,
    backups,
    createBackup,
    restoreBackup,
    backupSummary
  } = model;

  return (
      <div className="panel">
        <BoxTitle title="Data location + backups" />
        <p className="muted">{dbPath || "Database not available"}</p>
        <div className="row">
          <button onClick={createBackup}>Create backup</button>
        </div>
        <p className="muted">{backupSummary}</p>
        {backups.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Backup</th>
                <th>Size</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((backup: any) => (
                <tr key={backup.name}>
                  <td>{backup.name}</td>
                  <td>{formatFileSize(backup.size)}</td>
                  <td>
                    <button onClick={() => restoreBackup(backup.name)}>Restore</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

  );
}

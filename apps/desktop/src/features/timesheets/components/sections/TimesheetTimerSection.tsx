export function TimesheetTimerSection({ model }: { model: any }) {
  const {
    activeEntry,
    formatDuration,
    projectId,
    projects,
    runningSeconds,
    setProjectId,
    setTaskId,
    start,
    stop,
    taskId,
    tasks
  } = model;

  return (
    <div className="panel">
      <div className="row">
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Select project</option>
          {projects.map((project: any) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
          <option value="">Task (optional)</option>
          {tasks
            .filter((task: any) => !projectId || String(task.project_id) === projectId)
            .map((task: any) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
        </select>
        <button onClick={start}>Start timer</button>
        <button onClick={stop}>Stop timer</button>
        {activeEntry ? (
          <span className="muted">
            Running entry #{activeEntry.id} · {formatDuration(runningSeconds)}
          </span>
        ) : (
          <span className="muted">No active timer</span>
        )}
      </div>
    </div>
  );
}

export function TimesheetProjectSetupSection({ model }: { model: any }) {
  const {
    BoxTitle,
    CollapsibleSection,
    activeClients,
    clients,
    createProject,
    createTask,
    deleteProject,
    deleteTask,
    projectForm,
    projectSetupSummary,
    projects,
    setProjectForm,
    setTaskForm,
    taskForm,
    tasks
  } = model;

  return (
    <CollapsibleSection
      title="Project setup"
      summary={projectSetupSummary}
      defaultOpen={projects.length === 0}
    >
      <div className="panel">
        <BoxTitle title="Create project" />
        <div className="row">
          <input
            placeholder="Project name"
            value={projectForm.name}
            onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
          />
          <select
            value={projectForm.client_id}
            onChange={(e) => setProjectForm({ ...projectForm, client_id: e.target.value })}
          >
            <option value="">Client (optional)</option>
            {activeClients.map((client: any) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Hourly rate"
            value={projectForm.hourly_rate}
            onChange={(e) => setProjectForm({ ...projectForm, hourly_rate: e.target.value })}
          />
          <input
            placeholder="Tags"
            value={projectForm.tags}
            onChange={(e) => setProjectForm({ ...projectForm, tags: e.target.value })}
          />
          <button onClick={createProject}>Add project</button>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Projects" />
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Client</th>
              <th>Rate</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project: any) => {
              const client = clients.find((c: any) => c.id === project.client_id);
              return (
                <tr key={project.id}>
                  <td>{project.name}</td>
                  <td>{client ? client.name : project.client_id || ""}</td>
                  <td>{project.hourly_rate || ""}</td>
                  <td>
                    <button onClick={() => deleteProject(project.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <BoxTitle title="Create task" />
        <div className="row">
          <select
            value={taskForm.project_id}
            onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
          >
            <option value="">Select project</option>
            {projects.map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Task name"
            value={taskForm.name}
            onChange={(e) => setTaskForm({ ...taskForm, name: e.target.value })}
          />
          <button onClick={createTask}>Add task</button>
        </div>
      </div>
      <div className="panel">
        <BoxTitle title="Tasks" />
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Task</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task: any) => {
              const project = projects.find((p: any) => p.id === task.project_id);
              return (
                <tr key={task.id}>
                  <td>{project ? project.name : task.project_id}</td>
                  <td>{task.name}</td>
                  <td>
                    <button onClick={() => deleteTask(task.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

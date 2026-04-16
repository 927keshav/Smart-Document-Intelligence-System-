import React from 'react';

const dummyTasks = [
  { id: 1, name: 'Review extracted summary', deadline: '2026-03-22' },
  { id: 2, name: 'Validate action items with backend response', deadline: '2026-03-24' },
  { id: 3, name: 'Prepare final delivery notes', deadline: '2026-03-27' },
];

function TaskList({ tasks = dummyTasks }) {
  return (
    <section
      style={{
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '24px',
        padding: '24px',
        backdropFilter: 'blur(16px)',
      }}
    >
      <h2 style={{ margin: '0 0 16px', fontSize: '1.45rem' }}>Tasks</h2>
      <div style={{ display: 'grid', gap: '14px' }}>
        {tasks.map((task) => (
          <div
            key={task.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              alignItems: 'center',
              padding: '16px 18px',
              borderRadius: '18px',
              background: 'rgba(8, 17, 31, 0.34)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700 }}>{task.name}</div>
              <div style={{ marginTop: '6px', color: 'rgba(255,255,255,0.68)' }}>Task name</div>
            </div>
            <div
              style={{
                minWidth: '120px',
                textAlign: 'right',
                color: '#8fd8ff',
                fontWeight: 700,
              }}
            >
              {task.deadline}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default TaskList;

import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ProjectOrganizer } from '@tigao/organizer-react';
import { createMemoryOrganizerHarness } from '@tigao/organizer-contract-tests';
import '../../../packages/organizer-react/src/styles.css';
import './playground.css';

function Playground() {
  const [ownerId, setOwnerId] = useState(null);
  const [parentId, setParentId] = useState(null);
  const [narrow, setNarrow] = useState(false);
  const [corruptTree, setCorruptTree] = useState(false);
  const [adapterVersion, setAdapterVersion] = useState(0);
  const [lastError, setLastError] = useState(null);
  const harness = useMemo(() => {
    const created = createMemoryOrganizerHarness();
    created.controls.setCorruptTree(corruptTree);
    return created;
  }, [adapterVersion, corruptTree]);

  const resetAdapter = (nextCorruptTree = corruptTree) => {
    setCorruptTree(nextCorruptTree);
    setParentId(null);
    setAdapterVersion((version) => version + 1);
    setLastError(null);
  };

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <div>
          <p className="playground-eyebrow">Local component playground</p>
          <h1>Project organizer</h1>
          <p>Fake in-memory data resets when the page reloads.</p>
        </div>
        <div className="playground-controls" aria-label="Playground controls">
          <button type="button" onClick={() => { setOwnerId(null); setParentId(null); }}>Editable owner</button>
          <button type="button" onClick={() => { setOwnerId(2); setParentId(20); }}>Read-only owner</button>
          <button type="button" aria-pressed={narrow} onClick={() => setNarrow((value) => !value)}>Narrow layout</button>
          <button type="button" onClick={() => harness.controls.failNext('repositionItem')}>Fail next move</button>
          <button type="button" aria-pressed={corruptTree} onClick={() => resetAdapter(!corruptTree)}>Toggle broken tree</button>
          <button type="button" onClick={() => resetAdapter(false)}>Reset data</button>
        </div>
      </header>
      {lastError && <p className="playground-error">Last error: {lastError.message}</p>}
      <div className={`playground-stage${narrow ? ' playground-stage--narrow' : ''}`}>
        <ProjectOrganizer
          key={adapterVersion}
          adapter={harness.adapter}
          ownerId={ownerId}
          currentParentId={parentId}
          onCurrentParentIdChange={setParentId}
          onError={setLastError}
          messages={{ title: 'Teaching projects' }}
          renderProjectExtraActions={(project) => (
            <button type="button" className="playground-extra" onClick={() => window.alert(`Extra action: ${project.name}`)}>
              •••
            </button>
          )}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Playground />
  </React.StrictMode>
);

import { useState, useSyncExternalStore } from 'react';
import { Button, Modal, Toast } from '@capra/core';
import { restartWorkers } from '../api/cribl';
import type { Product } from '../api/types';
import type { NodeRow } from '../model/nodes';

/**
 * Restart is the app's only volatile operation. It always runs behind an explicit button click
 * and a confirmation modal that names every affected Node, and reports each outcome.
 *
 * `confirmRestart` is callable from anywhere; `RestartModalHost` (mounted once in App) renders
 * the dialog.
 */

interface RestartRequest {
  targets: NodeRow[];
  skipped: number;
  onDone?: () => void;
}

let current: RestartRequest | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function confirmRestart(nodes: NodeRow[], onDone?: () => void): void {
  const targets = nodes.filter((n) => !n.disconnected);
  if (!targets.length) {
    Toast.warning('None of the selected Nodes are connected, so there is nothing to restart.');
    return;
  }
  current = { targets, skipped: nodes.length - targets.length, onDone };
  emit();
}

function close() {
  current = null;
  emit();
}

async function runRestart(req: RestartRequest): Promise<void> {
  const byProduct = new Map<Product, NodeRow[]>();
  for (const n of req.targets) byProduct.set(n.product, [...(byProduct.get(n.product) ?? []), n]);
  let ok = 0;
  const failures: string[] = [];
  for (const [product, list] of byProduct) {
    try {
      const results = await restartWorkers(product, list.map((n) => n.id));
      const byId = new Map(results.map((r) => [r.id, r]));
      for (const n of list) {
        const r = byId.get(n.id);
        if (!r || r.status === 'Restarting') ok++;
        else failures.push(`${n.hostname}: ${r.message ?? r.status}`);
      }
    } catch (err) {
      for (const n of list) failures.push(`${n.hostname}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (ok) Toast.success(`Restart requested for ${ok} Node${ok > 1 ? 's' : ''}.`);
  for (const f of failures) Toast.error(`Restart failed. ${f}`, { duration: 10_000 });
  req.onDone?.();
}

export function RestartModalHost() {
  const req = useSyncExternalStore(subscribe, () => current);
  const [busy, setBusy] = useState(false);
  if (!req) return null;
  const many = req.targets.length > 1;
  const confirm = async () => {
    setBusy(true);
    try {
      await runRestart(req);
    } finally {
      setBusy(false);
      close();
    }
  };
  return (
    <Modal
      isOpen
      title={many ? `Restart ${req.targets.length} Nodes?` : `Restart ${req.targets[0].hostname}?`}
      isDismissible={!busy}
      onIsOpenChange={(open) => {
        if (!open && !busy) close();
      }}
      onClose={() => {
        if (!busy) close();
      }}
      footer={
        <Modal.FooterActions>
          <Button variant="tertiary" disabled={busy} onClick={close}>Cancel</Button>
          <Button variant="primary" appearance="danger" pending={busy} onClick={() => void confirm()}>
            {many ? `Restart ${req.targets.length} Nodes` : 'Restart Node'}
          </Button>
        </Modal.FooterActions>
      }
    >
      <p>
        Each Node below will stop processing, restart its Cribl process and reconnect to the Leader. In-flight data that
        is not persisted (for example, Destinations without persistent queues) may be lost. This cannot be undone.
      </p>
      <ul>
        {req.targets.map((n) => (
          <li key={n.id}>
            <strong>{n.hostname}</strong> <span className="muted">({n.group} · {n.product})</span>
          </li>
        ))}
      </ul>
      {req.skipped > 0 && (
        <p className="muted">
          {req.skipped} disconnected Node{req.skipped > 1 ? 's' : ''} will be skipped.
        </p>
      )}
    </Modal>
  );
}

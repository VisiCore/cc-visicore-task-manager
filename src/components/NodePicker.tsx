import { useMemo } from 'react';
import { SelectField } from '@capra/core';
import { useFleet } from '../hooks/fleet';

interface NodePickerProps {
  value: string;
  onChange: (nodeId: string) => void;
  /** Group into Connected / Disconnected sections. */
  sections?: boolean;
}

/** Edge Node dropdown with type-ahead search, shared by the Processes, Files and Services pages. */
export function NodePicker({ value, onChange, sections = true }: NodePickerProps) {
  const fleet = useFleet();
  const data = fleet.data;
  const count = data?.nodes.length ?? 0;
  const items = useMemo(() => {
    const nodes = data?.nodes ?? [];
    const toItem = (n: (typeof nodes)[number]) => ({ id: n.id, label: `${n.hostname} · ${n.group}` });
    if (!sections) return nodes.map(toItem);
    const up = nodes.filter((n) => !n.disconnected).map(toItem);
    const down = nodes.filter((n) => n.disconnected).map(toItem);
    const out: { id: string; label: string; children: { id: string; label: string }[] }[] = [];
    if (up.length) out.push({ id: '__up', label: `Connected (${up.length})`, children: up });
    if (down.length) out.push({ id: '__down', label: `Disconnected (${down.length})`, children: down });
    return out;
  }, [data, sections]);
  return (
    <div className="toolbar-select">
      <SelectField
        aria-label="Edge Node"
        size="sm"
        items={items}
        value={value || null}
        placeholder={count ? 'Choose an Edge Node' : 'No Edge Nodes'}
        canSearch={count > 6}
        searchPlaceholder="Search nodes"
        onChange={(k) => onChange(k ? String(k) : '')}
        shouldAutoSizeDropdown
      />
    </div>
  );
}

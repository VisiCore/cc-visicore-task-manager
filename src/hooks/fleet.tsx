import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { getLeaderHealth, getSystemInfo, listGroups, listWorkers } from '../api/cribl';
import { fetchCpuForNodes, fetchGroupThroughput, fetchNodeSnapshot, fetchNodeThroughput } from '../api/metrics';
import type { ConfigGroup, LeaderHealth, SystemInfo } from '../api/types';
import { buildGroupRows, buildNodeRows, fleetTotals, type FleetTotals, type GroupRow, type NodeRow } from '../model/nodes';
import { usePolling, type PollState } from './usePolling';
import { useSettings } from './settings';

export interface FleetData {
  nodes: NodeRow[];
  groups: GroupRow[];
  rawGroups: ConfigGroup[];
  totals: FleetTotals;
  leader?: SystemInfo;
  leaderHealth?: LeaderHealth;
  /** Per-data-source failures that did not block the rest of the refresh. */
  warnings: string[];
  /** True when the metrics store answered; false means memory/disk/load are from heartbeats only. */
  metricsAvailable: boolean;
  /** Ids of the Edge Fleets in scope; metrics rows from other groups are ignored. */
  fleetIds: Set<string>;
}

const FleetContext = createContext<PollState<FleetData> | undefined>(undefined);

async function settle<T>(p: Promise<T>, label: string, warnings: string[]): Promise<T | undefined> {
  try {
    return await p;
  } catch (err) {
    warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

/** One shared poll of everything the Summary, Nodes and Groups pages need. */
export function FleetProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const sampleCpu = settings.sampleCpu;

  const state = usePolling<FleetData>(
    async (signal) => {
      const warnings: string[] = [];
      const [allWorkers, allGroups, snapshot, throughput, groupThroughput, leader, leaderHealth] = await Promise.all([
        listWorkers(signal),
        listGroups(signal),
        settle(fetchNodeSnapshot(signal), 'Metrics (resources)', warnings),
        settle(fetchNodeThroughput(120, signal), 'Metrics (throughput)', warnings),
        settle(fetchGroupThroughput(120, signal), 'Metrics (fleet throughput)', warnings),
        settle(getSystemInfo(signal), 'Leader info', warnings),
        getLeaderHealth(signal),
      ]);
      // This app is Edge-only: keep Edge Fleets and the Nodes that belong to them.
      const rawGroups = allGroups.filter((g) => g.type === 'edge' || g.isFleet === true);
      const fleetIds = new Set(rawGroups.map((g) => g.id));
      const workers = allWorkers.filter((w) => fleetIds.has(w.group) || w.info?.cribl?.distMode === 'managed-edge');
      const connected = workers.filter((w) => !w.disconnected).map((w) => w.id);
      const cpu = sampleCpu ? await fetchCpuForNodes(connected, 4, signal) : undefined;
      const nodes = buildNodeRows({ workers, groups: rawGroups, snapshot, throughput, cpu });
      nodes.sort((a, b) => a.group.localeCompare(b.group) || a.hostname.localeCompare(b.hostname));
      const groups = buildGroupRows(rawGroups, nodes, groupThroughput);
      return {
        nodes,
        groups,
        rawGroups,
        totals: fleetTotals(nodes, groupThroughput ? groups : undefined),
        leader,
        leaderHealth,
        warnings,
        metricsAvailable: snapshot !== undefined || groupThroughput !== undefined,
        fleetIds,
      };
    },
    [sampleCpu],
    settings.refreshSeconds * 1000,
  );

  const value = useMemo(() => state, [state]);
  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}

export function useFleet(): PollState<FleetData> {
  const ctx = useContext(FleetContext);
  if (!ctx) throw new Error('useFleet must be used inside FleetProvider');
  return ctx;
}

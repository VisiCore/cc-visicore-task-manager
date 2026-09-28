# Task Manager

A task manager for Cribl Edge: live OS processes on every Edge Node, plus CPU, memory, disk, load, throughput and health for every Fleet, in one place.

## Summary

Task Manager is a Cribl app for operating Edge Fleets. It shows what is running on each Edge Node right now, which Node or Source is hurting, and lets you restart Nodes safely from the same screen.

## What This App Does

* Primary purpose: an at-a-glance, auto-refreshing task manager for Cribl Edge, modelled on desktop task managers.
* Key capabilities:
  * **Summary** – fleet meters (CPU, memory, disk, health), top CPU processes across connected Nodes, a Fleet map (Fleets as groups, Nodes as tiles sized by events/s, memory or busy cores; click for a readout, double-click to open), load and throughput charts, memory utilization over time, top Sources, Fleet roll-ups and Leader status. Throughput, dropped and memory figures carry a change versus the previous window of the same length.
  * **Processes** – a live treemap of every OS process on an Edge Node, sized by %CPU or memory and grouped by user or service, with a table view one key away. Click a process or group and the selection rail shows its share, change since the previous refresh, state, threads, CPU time, start time and a CPU trend. A "Worth a look" list surfaces the biggest CPU movers, memory growers and zombie or disk-wait processes. Keyboard: `1`/`2` switch view, `m` CPU/memory, `g` grouping, `/` filter, `esc` clear. Running containers are listed below.
  * **Process details** – click any process for a drawer with its full command line, executable, parent, threads, open file count, priority, disk and total IO, every TCP/UDP socket with local and remote address and state, the log files it has open, and its environment (values masked, secrets never shown).
  * **Files** – a log-file inventory with the process that has each file open, a directory browser, a viewer showing the head and tail of any file, and in-place search, all read from the Node without ingesting anything.
  * **Services & ports** – systemd units (with CPU and memory joined from their processes), listening ports with the owning process, mounts with usage, network interfaces and local users, from the Node's `system_state` collectors.
  * **Problems** – a Summary panel that flags disconnected or late Nodes, memory or disk over 90%, high CPU, drop rates over 50%, config or version drift within a Fleet, red Sources or Destinations, and zombie or runaway processes, each linking to where to act.
  * **Edge Nodes** – every Node with status, CPU, memory, disk, load, events in/out/dropped, Worker Process count, version and uptime. Filter by Fleet or problems; sort any column; select Nodes to restart.
  * **Node detail** – top processes by CPU, CPU per Worker Process, memory, load and throughput history, system facts (version, config version, platform, heartbeat, IP, disk) and the Sources and Destinations running on that Node with their health.
  * **Fleets** – Node counts, average CPU and memory, throughput, software and config versions. Fleet detail adds Source, Destination, Pipeline, Route and Pack counts plus per-Fleet Node, Source, Destination and Pipeline tables.
  * **Sources / Destinations / Pipelines** – health and throughput per Fleet over the selected time range, with problem filters and a "vs prev" column comparing events with the previous window of the same length (Pipelines also show the change in drop rate).
  * **Restart** – restart selected Nodes after an explicit confirmation that names each Node.
* Intended users: Admins and platform owners who operate Cribl Edge.
* Works with: Cribl Edge Fleets managed by a Cribl.Cloud, hybrid or self-hosted Leader.

## When To Use This App

* You want one screen that answers "is the fleet healthy, which Node is hot, and what is it running?"
* A Group is dropping events or a Destination is red and you need to find it quickly.
* You need to restart one or more Nodes and want to see exactly what you are about to touch.

## Before You Install

* Required deployment type: a Leader managing at least one Edge Fleet. Stream Worker Groups are not shown.
* Required permissions: the policies declared by the app (listed under Permissions). Users the app is shared with receive them automatically; other users need equivalent role permissions.
* Required external systems or APIs: none. The app makes no external calls.
* Required configuration values: none. Settings are optional and have safe defaults.
* Services, ports, mounts, interfaces and users need the `system_state` Source enabled on the Fleet (it is on by default); the page says so when it is not.
* Known limits: per-Node metrics come from each Node (one small request per connected Node per refresh).

## Installation

### Install From Marketplace or URL
1. Go to Apps in your Cribl environment.
2. Choose the Marketplace or import from URL option.
3. Install Task Manager from the Marketplace, or import it from its Marketplace-hosted URL.
4. Review the app details and permissions, then complete installation.

### If The App Is Not Yet In The Cribl Marketplace
1. Open the app's GitHub repository and go to Releases.
2. Download the `.tgz` package for the version you want.
3. In Cribl, go to Apps and choose import from file.
4. Upload the `.tgz`, review the app details and complete installation.

## Configuration

| Setting | Required | Description | Example | Scope |
|---|---|---|---|---|
| Auto-refresh | No | How often lists, meters and charts reload while the tab is visible. Off means manual refresh only. | Every 30 seconds | per-app |
| Default time range | No | The window charts and per-range throughput start with. The header buttons change it for the session. | 1 hour | per-app |
| Rows in Summary lists | No | How many Sources and Groups the Summary page lists. | 8 | per-app |
| Read metrics from each Node | No | Fetch CPU, memory, disk and throughput from every connected Node each refresh. Leave on; off leaves only Fleet-level throughput. | On | per-app |

Settings are stored in the app's KV store and apply to everyone who uses the app. Leaving everything unchanged is safe.

## How To Use

### Typical Workflow
1. Open Task Manager from the Apps page. The Summary shows fleet meters, charts and top Sources within a few seconds.
2. Pick a time range (15m, 1h, 6h, 24h) in the header; every chart and per-range figure follows it.
3. Go to Nodes and sort by CPU, memory or dropped events to find the busiest Node. Use the Problems filter to show only unhealthy, late or disconnected Nodes.
4. Open a Node to see CPU per Worker Process, resource history and the Sources and Destinations it runs.
5. Open a Group to see its Nodes, configuration counts and per-group Sources, Destinations and Pipelines.
6. To restart Nodes, select them and click Restart selected. Review the list in the confirmation dialog, then confirm. The result is reported per Node.

### First-Run Checklist
* Confirm the status bar shows "Leader healthy" and a Node count.
* If meters show "--", check that the metrics-store policies were granted (see Permissions).
* Optionally adjust auto-refresh and the default time range in Settings.

## Permissions

All permissions are declared in the app's `policies.yml` and granted automatically when an admin shares the app. If a user lacks one, the affected panel shows a message and the rest of the app keeps working.

### Cribl API Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Leader health for the status bar |
| GET | `/api/v1/system/info` | Leader version, uptime, resources and messages |
| GET | `/api/v1/master/groups` | List Worker Groups and Edge Fleets |
| GET | `/api/v1/master/workers` | List Worker and Edge Nodes with heartbeat facts |
| GET | `/api/v1/products/:product/groups/:group/summary` | Source, Destination, Pipeline, Route and Pack counts for a group |
| POST | `/api/v1/system/metrics/query` | Memory, disk, load, throughput and Source/Destination/Pipeline health from the Leader metrics store |
| GET | `/api/v1/w/:wid/system/metrics` | CPU per Worker Process from one Node |
| GET | `/api/v1/w/:wid/system/info` | System facts for one Node |
| GET | `/api/v1/w/:wid/system/status/inputs` | Source status on one Node |
| GET | `/api/v1/w/:wid/system/status/outputs` | Destination status on one Node |
| GET | `/api/v1/w/:wid/edge/processes` | Live OS process list from an Edge Node |
| GET | `/api/v1/w/:wid/edge/containers` | Running containers on an Edge Node |
| GET | `/api/v1/w/:wid/edge/logs` | Log files on the Node and the processes that have them open |
| GET | `/api/v1/w/:wid/edge/ls/*` | Directory listing on the Node |
| GET | `/api/v1/w/:wid/edge/file/sample` | First bytes of a file |
| GET | `/api/v1/w/:wid/edge/fileinspect` | File size, hashes and head |
| POST | `/api/v1/w/:wid/edge/search/file` | Search or read a file in place |
| GET | `/api/v1/w/:wid/edge/metadata` | Host facts: OS, CPU, memory, interfaces |
| GET | `/api/v1/w/:wid/edge/events/query` | `system_state` collectors: services, ports, mounts, interfaces, users |
| PATCH | `/api/v1/products/:product/workers/restart` | Restart Nodes the user selected and confirmed |

The `/w/:wid` paths are authorized against their `/m/:gid` equivalents, which are declared as well.

## External API Access

This app makes no external calls. `proxies.yml` declares no domains.

## Data And Storage

* KV key `task-manager/settings` holds the settings above. It is shared by all users of the app.
* No metrics or Node data are persisted; everything is read live from the Leader on each refresh.
* Uninstalling the app removes its KV store.

## Support

### Partner Built
This app is built by VisiCore Tech (Andrew Hendrix). The partner owns support, maintenance and feature requests for this app. Cribl does not provide direct support for app-specific behavior. Open an issue on the app's GitHub repository to reach the maintainer.

## Known Limitations

* The Leader's metrics store keeps Edge metrics per Fleet only, so per-Node memory, load, disk, CPU and throughput history are read from each Node. The Summary samples the first twelve connected Nodes for its memory and load charts; throughput uses the Fleet-level rows and covers every Node.
* Only Edge Fleets and Edge Nodes are shown. Stream Worker Groups do not expose OS processes through the API and are out of scope.
* The process list is live and not stored; there is no process history. The Summary samples the first six connected Nodes; the Processes page reads any Node.
* Per-Node CPU is only available from connected Nodes; disconnected Nodes show "--".
* Source, Destination and Pipeline figures come from the Leader metrics store and cover the selected time range; objects with no traffic in that window are not listed.
* Outpost Groups are listed but have no restart action.
* Restart is the only write. Nothing is changed on load, on a timer or without confirmation.

## Troubleshooting

### The App Opens But Some Features Do Not Work
* Meters show "--" and the status bar says "metrics store unavailable": the `POST /system/metrics/query` policy is missing, or the Leader metrics store is disabled.
* CPU, memory and disk show "--" for every Node: the `/w/:wid/system/metrics` policy is missing, or "Read metrics from each Node" is off in Settings.

### The App Cannot Connect To An API Or Service
* Check the app's declared policies were granted to your user, and that the Leader is reachable.

### The App Works Locally But Not In Cribl
* Rebuild and repackage with `npm run package`, then re-import the `.tgz`.

import React from 'react';
import { ScrollText, History, RefreshCw } from 'lucide-react';
import { ActivityLogItem, PaginatedMeta, RegistrationEventItem } from '../api.js';

interface LogsViewProps {
  logSubTab: 'activity' | 'registration';
  setLogSubTab: (tab: 'activity' | 'registration') => void;
  activityLogs: ActivityLogItem[];
  logsMeta: PaginatedMeta;
  regEvents: RegistrationEventItem[];
  regEventsMeta: PaginatedMeta;
  onLoadLogsAndHistory: (page: number) => void;
}

/**
 * Audit logs & supervised registration event transition history.
 */
export function LogsView({
  logSubTab,
  setLogSubTab,
  activityLogs,
  logsMeta,
  regEvents,
  regEventsMeta,
  onLoadLogsAndHistory,
}: LogsViewProps) {
  const activeMeta = logSubTab === 'activity' ? logsMeta : regEventsMeta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900/70 p-1">
          <button
            type="button"
            onClick={() => setLogSubTab('activity')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-xs transition cursor-pointer ${
              logSubTab === 'activity'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <ScrollText className="h-3.5 w-3.5" />
            <span>SYSTEM &amp; USER ACTIVITY LOGS ({logsMeta.total})</span>
          </button>
          <button
            type="button"
            onClick={() => setLogSubTab('registration')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-xs transition cursor-pointer ${
              logSubTab === 'registration'
                ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>REGISTRATION CONFIRMATION HISTORY ({regEventsMeta.total})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onLoadLogsAndHistory(activeMeta.page)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
          REFRESH
        </button>
      </div>

      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 overflow-hidden">
        {logSubTab === 'activity' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 font-mono text-[11px] uppercase text-zinc-400">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Entity</th>
                  <th className="p-3.5">Audit Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center font-mono text-zinc-500">
                      No activity logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  activityLogs.map((log) => (
                    <tr key={log.id} className="transition hover:bg-zinc-800/30">
                      <td className="p-3.5 font-mono tabular-nums text-zinc-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-200">{log.username}</td>
                      <td className="p-3.5 font-mono">
                        <span className="rounded-md border border-zinc-700/80 bg-zinc-800/70 px-2 py-0.5 text-[11px] text-cyan-300">
                          {log.action}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono text-zinc-400">
                        {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)})` : ''}
                      </td>
                      <td className="p-3.5 font-mono text-[11px] text-zinc-400 max-w-md break-all">
                        {JSON.stringify(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 font-mono text-[11px] uppercase text-zinc-400">
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Event Type</th>
                  <th className="p-3.5">Candidate / Roblox Username</th>
                  <th className="p-3.5">Roblox User ID</th>
                  <th className="p-3.5">State Transition</th>
                  <th className="p-3.5">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {regEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center font-mono text-zinc-500">
                      No registration history recorded yet.
                    </td>
                  </tr>
                ) : (
                  regEvents.map((ev) => (
                    <tr key={ev.id} className="transition hover:bg-zinc-800/30">
                      <td className="p-3.5 font-mono tabular-nums text-zinc-500 whitespace-nowrap">
                        {new Date(ev.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-100">{ev.eventType}</td>
                      <td className="p-3.5 font-mono text-emerald-300">
                        {ev.robloxUsername || ev.candidateUsername || '—'}
                      </td>
                      <td className="p-3.5 font-mono tabular-nums text-zinc-300">
                        {ev.robloxUserId || '—'}
                      </td>
                      <td className="p-3.5 font-mono text-zinc-300">
                        <span className="text-zinc-500">{ev.statusBefore || 'INIT'}</span> &rarr;{' '}
                        <span className="text-cyan-300">{ev.statusAfter}</span>
                      </td>
                      <td className="p-3.5 text-zinc-400">{ev.notes || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-3 font-mono text-xs text-zinc-400">
          <span className="tabular-nums">
            Page {activeMeta.page} of {activeMeta.totalPages} ({activeMeta.total} total)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={activeMeta.page <= 1}
              onClick={() => onLoadLogsAndHistory(activeMeta.page - 1)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
            >
              PREV
            </button>
            <button
              type="button"
              disabled={activeMeta.page >= activeMeta.totalPages}
              onClick={() => onLoadLogsAndHistory(activeMeta.page + 1)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
            >
              NEXT
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

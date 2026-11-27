import React from 'react';
import { Layers, RefreshCw, Eye, Pause, Play, XCircle, X, CheckCircle2 } from 'lucide-react';
import { PaginatedMeta, RegistrationJob } from '../api.js';
import { getStatusBadgeClasses } from './types.js';

interface JobsViewProps {
  jobs: RegistrationJob[];
  jobsMeta: PaginatedMeta;
  selectedJob: RegistrationJob | null;
  onLoadJobs: (page: number) => void;
  onInspectJob: (jobId: string) => void;
  onJobAction: (jobId: string, action: 'pause' | 'resume' | 'cancel') => void;
  onCloseSelectedJob: () => void;
  onOpenSupervisedWorkflow: (candidateId: string) => void;
}

/**
 * Registration preparation jobs queue view + candidate detail inspector.
 */
export function JobsView({
  jobs,
  jobsMeta,
  selectedJob,
  onLoadJobs,
  onInspectJob,
  onJobAction,
  onCloseSelectedJob,
  onOpenSupervisedWorkflow,
}: JobsViewProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/55 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Registration Preparation Jobs ({jobsMeta.total})
              </h2>
              <p className="text-xs text-zinc-400">
                Manajemen antrean batch dengan kontrol pause, resume, cancel, &amp; supervised confirmation gating.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onLoadJobs(jobsMeta.page)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 hover:bg-zinc-800 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
            REFRESH
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/60 font-mono text-[11px] uppercase text-zinc-400">
                <th className="p-3.5">Job Name &amp; ID</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Progress</th>
                <th className="p-3.5">Verif Req</th>
                <th className="p-3.5">Failed</th>
                <th className="p-3.5">Created</th>
                <th className="p-3.5 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-xs">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center font-mono text-zinc-500">
                    No registration jobs queued yet.
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id} className="transition hover:bg-zinc-800/30">
                    <td className="p-3.5">
                      <div className="font-medium text-zinc-100">{job.name}</div>
                      <div className="font-mono text-[10px] text-zinc-500 mt-0.5">{job.id}</div>
                      {job.errorMessage && (
                        <div className="font-mono text-[10px] text-rose-400 mt-1">
                          Error: {job.errorMessage}
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 font-mono">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] ${getStatusBadgeClasses(
                          job.status
                        )}`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all"
                            style={{ width: `${job.progressPercent}%` }}
                          />
                        </div>
                        <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                          {job.completedCount}/{job.totalCount} ({job.progressPercent}%)
                        </span>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono tabular-nums text-amber-300">
                      {job.verificationRequiredCount}
                    </td>
                    <td className="p-3.5 font-mono tabular-nums text-zinc-400">
                      {job.failedCount}
                    </td>
                    <td className="p-3.5 font-mono text-zinc-500 tabular-nums">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => onInspectJob(job.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                        >
                          <Eye className="h-3 w-3 text-cyan-400" />
                          INSPECT
                        </button>
                        {job.status !== 'PAUSED' &&
                          job.status !== 'COMPLETED' &&
                          job.status !== 'CANCELED' && (
                            <button
                              type="button"
                              onClick={() => onJobAction(job.id, 'pause')}
                              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-800 cursor-pointer"
                            >
                              <Pause className="h-3 w-3" />
                              PAUSE
                            </button>
                          )}
                        {job.status === 'PAUSED' && (
                          <button
                            type="button"
                            onClick={() => onJobAction(job.id, 'resume')}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                          >
                            <Play className="h-3 w-3" />
                            RESUME
                          </button>
                        )}
                        {job.status !== 'COMPLETED' && job.status !== 'CANCELED' && (
                          <button
                            type="button"
                            onClick={() => onJobAction(job.id, 'cancel')}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/35 bg-rose-950/30 px-2.5 py-1 font-mono text-[11px] text-rose-300 hover:bg-rose-900/40 cursor-pointer"
                          >
                            <XCircle className="h-3 w-3" />
                            CANCEL
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800/80 px-4 py-3 font-mono text-xs text-zinc-400">
          <span className="tabular-nums">
            Page {jobsMeta.page} of {jobsMeta.totalPages} ({jobsMeta.total} jobs)
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={jobsMeta.page <= 1}
              onClick={() => onLoadJobs(jobsMeta.page - 1)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
            >
              PREV
            </button>
            <button
              type="button"
              disabled={jobsMeta.page >= jobsMeta.totalPages}
              onClick={() => onLoadJobs(jobsMeta.page + 1)}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 disabled:opacity-40 hover:bg-zinc-800 cursor-pointer"
            >
              NEXT
            </button>
          </div>
        </div>
      </section>

      {/* Selected Job Detail Inspector */}
      {selectedJob && (
        <section className="rounded-2xl border border-cyan-500/30 bg-zinc-900/75 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">
                Job Candidates Inspector: {selectedJob.name}
              </h3>
              <p className="font-mono text-xs text-zinc-400 mt-0.5 tabular-nums">
                Status: {selectedJob.status} &bull; Processed: {selectedJob.processedCount}/
                {selectedJob.totalCount} &bull; Registered: {selectedJob.completedCount}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close job inspector"
              onClick={onCloseSelectedJob}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 font-mono text-xs text-zinc-300 hover:bg-zinc-800 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              CLOSE
            </button>
          </div>

          <div className="overflow-x-auto max-h-80 rounded-xl border border-zinc-800/80">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/70 font-mono text-[11px] uppercase text-zinc-400">
                  <th className="p-2.5">Candidate</th>
                  <th className="p-2.5">State</th>
                  <th className="p-2.5">Attempts</th>
                  <th className="p-2.5">Error / Notes</th>
                  <th className="p-2.5 text-right">Supervised Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {(selectedJob.candidates ?? []).map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-800/25">
                    <td className="p-2.5 font-mono text-zinc-100">{c.candidateUsername}</td>
                    <td className="p-2.5 font-mono">
                      <span
                        className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] ${getStatusBadgeClasses(
                          c.registrationState
                        )}`}
                      >
                        {c.registrationState}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono tabular-nums text-zinc-400">{c.attemptCount}</td>
                    <td className="p-2.5 font-mono text-zinc-500">
                      {c.lastError || 'Ready for human registration'}
                    </td>
                    <td className="p-2.5 text-right">
                      {c.registrationState !== 'REGISTERED' ? (
                        <button
                          type="button"
                          onClick={() => onOpenSupervisedWorkflow(c.id)}
                          className="rounded-lg bg-zinc-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-zinc-950 hover:bg-zinc-200 cursor-pointer"
                        >
                          OPEN CHECKLIST &amp; CONFIRM
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          REGISTERED
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

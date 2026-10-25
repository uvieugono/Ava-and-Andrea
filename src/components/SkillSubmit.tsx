import React, { useState } from 'react';
import { useGym } from '../context/GymContext';
import { MAX_VIDEO_MB } from '../services/gymApi';
import { Skill } from '../types';

/** Upload a video for one skill, or see what the club decided. Used on the Skills and My Progress pages. */
export const SkillSubmit: React.FC<{ skill: Skill }> = ({ skill }) => {
  const { user, submitSkillVideo, withdrawSkillVideo } = useGym();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isCurrentLevel = skill.level === user.level;
  const send = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const outcome = await submitSkillVideo(skill.id, file);
    setResult(outcome);
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      {skill.status === 'AWAITING_VERIFICATION' && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900 space-y-2">
          <p>Pending approval. Your club has your video and will leave a comment when it decides.</p>
          {skill.submissionId && (
            confirming ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>Delete this video? Your club will no longer see it.</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setResult(await withdrawSkillVideo(skill.submissionId as string));
                    setBusy(false);
                    setConfirming(false);
                  }}
                  className="px-3 py-1.5 rounded-full bg-red-700 text-white disabled:opacity-60"
                >
                  {busy ? 'Deleting…' : 'Delete video'}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="px-3 py-1.5 rounded-full border border-amber-300">Keep</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="text-sm underline">Delete this video</button>
            )
          )}
        </div>
      )}
      {skill.status === 'VERIFIED' && (
        <p className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-900">
          Approved by your club.{skill.verifiedNote ? ` “${skill.verifiedNote}”` : ''}
        </p>
      )}
      {skill.status === 'CHANGES_REQUIRED' && (
        <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">
          Not approved yet. Club feedback: {skill.verifiedNote ? `“${skill.verifiedNote}”` : 'no comment left.'} Work on it and send a new video.
        </p>
      )}
      {skill.videoPreviewUrl && (
        <video src={skill.videoPreviewUrl} controls preload="metadata" className="w-full rounded-xl bg-black max-h-56" />
      )}
      {skill.status !== 'VERIFIED' && skill.status !== 'AWAITING_VERIFICATION' && (
        isCurrentLevel ? (
          <label className={`inline-block text-sm text-white rounded-full px-4 py-2 ${busy ? 'bg-[#5C2A6E]/60' : 'bg-[#5C2A6E] cursor-pointer'}`}>
            {busy ? 'Uploading…' : skill.status === 'CHANGES_REQUIRED' ? 'Send a new video' : 'Submit video for approval'}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={busy}
              onChange={(event) => {
                const input = event.target;
                send(input.files?.[0]).finally(() => { input.value = ''; });
              }}
            />
          </label>
        ) : (
          <p className="text-sm text-[#5C4A68]">You can submit this skill once you reach Level {skill.level}.</p>
        )
      )}
      {skill.status !== 'VERIFIED' && skill.status !== 'AWAITING_VERIFICATION' && isCurrentLevel && (
        <p className="text-xs text-[#5C4A68]">MP4, MOV or WebM, up to {MAX_VIDEO_MB} MB. Only you and your club can watch it.</p>
      )}
      {result && (!result.ok || skill.status === 'AWAITING_VERIFICATION' || result.message.startsWith('Video deleted')) && (
        <p className={`text-sm ${result.ok ? 'text-emerald-800' : 'text-red-600'}`} role={result.ok ? 'status' : 'alert'}>{result.message}</p>
      )}
    </div>
  );
};

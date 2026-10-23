import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useGym } from '../context/GymContext';
import { mediaUrl } from '../services/gymApi';
import {
  CERTIFICATE_TEMPLATES,
  CertificateTemplate,
  canvasToBlob,
  drawCertificate,
  loadImage,
} from '../lib/certificate';

type Note = { ok: boolean; message: string } | null;

const FIELD = 'w-full rounded-xl border border-[#E4D7EE] px-3 py-2 text-sm';

/** Club details used on certificates. Only the club administrator can change them. */
export const ClubCertificateDetails: React.FC = () => {
  const { clubDetails, updateClubDetails, userRole } = useGym();
  const [coachName, setCoachName] = useState(clubDetails?.coachName ?? '');
  const [logo, setLogo] = useState<File | null>(null);
  const [signature, setSignature] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);

  useEffect(() => {
    setCoachName(clubDetails?.coachName ?? '');
  }, [clubDetails?.coachName]);

  if (userRole !== 'CLUB_ADMIN') return null;

  const save = async () => {
    setBusy(true);
    setNote(null);
    const result = await updateClubDetails({ coachName: coachName.trim(), logo, signature });
    setBusy(false);
    setNote(result);
    if (result.ok) {
      setLogo(null);
      setSignature(null);
    }
  };

  return (
    <details className="rounded-xl border border-[#E4D7EE] p-3">
      <summary className="cursor-pointer text-sm text-[#3E1B4A]">Club details on certificates</summary>
      <div className="mt-3 grid sm:grid-cols-3 gap-3 text-sm">
        <label className="space-y-1">
          <span className="block text-[#5C4A68]">Coach name</span>
          <input value={coachName} onChange={(event) => setCoachName(event.target.value)} className={FIELD} placeholder="Coach name" />
        </label>
        <label className="space-y-1">
          <span className="block text-[#5C4A68]">Club logo {clubDetails?.logoUrl ? '(saved)' : '(not added)'}</span>
          <input type="file" accept="image/png,image/jpeg" onChange={(event) => setLogo(event.target.files?.[0] ?? null)} className="text-xs" />
        </label>
        <label className="space-y-1">
          <span className="block text-[#5C4A68]">Coach signature {clubDetails?.signatureUrl ? '(saved)' : '(not added)'}</span>
          <input type="file" accept="image/png,image/jpeg" onChange={(event) => setSignature(event.target.files?.[0] ?? null)} className="text-xs" />
        </label>
      </div>
      <button type="button" disabled={busy} onClick={save} className="mt-3 px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">
        {busy ? 'Saving…' : 'Save club details'}
      </button>
      {note && <p className={`text-sm mt-2 ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.message}</p>}
    </details>
  );
};

const TemplateThumb: React.FC<{ template: CertificateTemplate; clubName: string }> = ({ template, clubName }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    drawCertificate(ref.current, template, {
      gymnastName: 'Gymnast Name',
      title: 'Certificate of Achievement',
      awardDate: new Date().toISOString().slice(0, 10),
      clubName: clubName || 'Your Club',
      coachName: 'Coach',
      logo: null,
      signature: null,
    });
  }, [template, clubName]);
  return <canvas ref={ref} className="w-full h-auto rounded-lg border border-[#E4D7EE]" />;
};

export const CertificateGenerator: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { rosterGymnasts, clubDetails, saveCertificate } = useGym();
  const [template, setTemplate] = useState<CertificateTemplate>('classic');
  const [gymnastId, setGymnastId] = useState(rosterGymnasts[0]?.id ?? '');
  const [otherName, setOtherName] = useState('');
  const [title, setTitle] = useState('Certificate of Achievement');
  const [awardDate, setAwardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [images, setImages] = useState<{ logo: HTMLImageElement | null; signature: HTMLImageElement | null }>({ logo: null, signature: null });
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const preview = useRef<HTMLCanvasElement>(null);

  const gymnast = rosterGymnasts.find((item) => item.id === gymnastId) ?? null;
  const gymnastName = gymnastId ? gymnast?.name ?? '' : otherName.trim();
  const clubName = clubDetails?.name ?? '';
  const coachName = clubDetails?.coachName ?? '';
  const missing = [
    !clubDetails?.logoUrl && 'club logo',
    !coachName && 'coach name',
    !clubDetails?.signatureUrl && 'coach signature',
  ].filter(Boolean) as string[];

  // Logo and signature are private club files, fetched with the sign-in token.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadImage(clubDetails?.logoUrl ? mediaUrl(clubDetails.logoUrl) : null),
      loadImage(clubDetails?.signatureUrl ? mediaUrl(clubDetails.signatureUrl) : null),
    ]).then(([logo, signature]) => {
      if (!cancelled) setImages({ logo, signature });
    });
    return () => {
      cancelled = true;
    };
  }, [clubDetails?.logoUrl, clubDetails?.signatureUrl]);

  useEffect(() => {
    if (!preview.current) return;
    document.fonts?.ready.then(() => {
      if (!preview.current) return;
      drawCertificate(preview.current, template, {
        gymnastName: gymnastName || 'Gymnast Name',
        title: title.trim() || 'Certificate Title',
        awardDate,
        clubName,
        coachName,
        logo: images.logo,
        signature: images.signature,
      });
    });
    setSaved(null);
  }, [template, gymnastName, title, awardDate, clubName, coachName, images]);

  const generate = async () => {
    setNote(null);
    if (!gymnastName) return setNote({ ok: false, message: 'Choose a gymnast or type their name.' });
    if (!title.trim()) return setNote({ ok: false, message: 'Enter the certificate title.' });
    if (!awardDate) return setNote({ ok: false, message: 'Enter the award date.' });
    if (!preview.current) return;
    setBusy(true);
    const blob = await canvasToBlob(preview.current);
    const result = await saveCertificate(blob, { gymnastId: gymnastId || null, gymnastName, title: title.trim(), awardDate, template });
    setBusy(false);
    setNote(result);
    if (result.ok && result.certificate) setSaved(result.certificate.uploadId);
  };

  const fileName = `${title.trim() || 'certificate'} - ${gymnastName || 'gymnast'}.png`.replace(/[^\w.\- ]/g, '_');

  const download = () => {
    if (!preview.current) return;
    const link = document.createElement('a');
    link.href = preview.current.toDataURL('image/png');
    link.download = fileName;
    link.click();
  };

  const print = () => {
    if (!preview.current) return;
    const page = window.open('', '_blank');
    if (!page) return setNote({ ok: false, message: 'Allow pop-ups to print, or download the certificate and print it.' });
    page.document.write(`<!doctype html><title>${fileName}</title><style>@page{size:landscape;margin:0}body{margin:0}img{width:100%}</style><img src="${preview.current.toDataURL('image/png')}" onload="window.print()">`);
    page.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#241628]/50 flex items-start sm:items-center justify-center p-3 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Generate certificate">
      <div className="bg-white rounded-2xl w-full max-w-4xl p-4 sm:p-6 space-y-4 my-4">
        <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-2 bg-white rounded-t-2xl flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-[#3E1B4A]">Generate Certificate</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2"><X className="w-5 h-5" /></button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-[#5C4A68] mb-1">1. Choose a template</legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {CERTIFICATE_TEMPLATES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTemplate(item.id)}
                aria-pressed={template === item.id}
                className={`text-left rounded-xl p-2 border-2 ${template === item.id ? 'border-[#5C2A6E] bg-[#F4EEF8]' : 'border-[#E4D7EE]'}`}
              >
                <TemplateThumb template={item.id} clubName={clubName} />
                <span className="block mt-2 text-sm text-[#241628]">{item.name}</span>
                <span className="block text-xs text-[#5C4A68]">{item.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-3 text-sm">
          <legend className="text-sm text-[#5C4A68] mb-1">2. Enter the details</legend>
          <label className="space-y-1">
            <span className="block text-[#5C4A68]">Gymnast name</span>
            <select value={gymnastId} onChange={(event) => setGymnastId(event.target.value)} className={FIELD}>
              {rosterGymnasts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value="">Someone not on the roster</option>
            </select>
            {!gymnastId && <input value={otherName} onChange={(event) => setOtherName(event.target.value)} placeholder="Gymnast name" className={FIELD} />}
          </label>
          <label className="space-y-1">
            <span className="block text-[#5C4A68]">Certificate title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} className={FIELD} />
          </label>
          <label className="space-y-1">
            <span className="block text-[#5C4A68]">Award date</span>
            <input type="date" value={awardDate} onChange={(event) => setAwardDate(event.target.value)} className={FIELD} />
          </label>
        </fieldset>

        <p className="text-xs text-[#5C4A68]">
          Filled in from your club: {clubName || 'club name'}{coachName ? `, ${coachName}` : ''}.
          {missing.length > 0 && ` Not added yet: ${missing.join(', ')}. Add them under "Club details on certificates".`}
        </p>

        <div>
          <p className="text-sm text-[#5C4A68] mb-1">3. Preview</p>
          <canvas ref={preview} className="w-full h-auto rounded-xl border border-[#E4D7EE]" />
        </div>

        {note && <p className={`text-sm ${note.ok ? 'text-emerald-800' : 'text-red-600'}`} role={note.ok ? 'status' : 'alert'}>{note.message}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={generate} className="px-4 py-2 rounded-full bg-[#5C2A6E] text-white text-sm disabled:opacity-60">
            {busy ? 'Saving…' : saved ? 'Saved' : 'Generate and save'}
          </button>
          <button type="button" disabled={!saved} onClick={download} className="px-4 py-2 rounded-full border border-[#E4D7EE] text-sm disabled:opacity-50">Download</button>
          <button type="button" disabled={!saved} onClick={print} className="px-4 py-2 rounded-full border border-[#E4D7EE] text-sm disabled:opacity-50">Print</button>
        </div>
      </div>
    </div>
  );
};

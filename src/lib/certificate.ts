// Draws a certificate onto a canvas. Three gymnastics-themed designs share the
// GymTrack purple palette. The result is saved as a PNG file.

export type CertificateTemplate = 'classic' | 'medal' | 'stars';

export const CERTIFICATE_TEMPLATES: { id: CertificateTemplate; name: string; description: string }[] = [
  { id: 'classic', name: 'Classic', description: 'Lavender with a double purple border and a leaping gymnast.' },
  { id: 'medal', name: 'Medal', description: 'White with a purple ribbon and a gold medal.' },
  { id: 'stars', name: 'Stars', description: 'Deep purple with stars and a gymnast in a split leap.' },
];

export interface CertificateText {
  gymnastName: string;
  title: string;
  awardDate: string;
  clubName: string;
  coachName: string;
  logo: HTMLImageElement | null;
  signature: HTMLImageElement | null;
}

export const CERT_WIDTH = 1600;
export const CERT_HEIGHT = 1131;

const DEEP = '#3E1B4A';
const PURPLE = '#5C2A6E';
const LAVENDER = '#F4EEF8';
const LINE = '#E4D7EE';
const GOLD = '#C9A227';

/** Loads an image for drawing. Resolves to null if it cannot be loaded. */
export function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Shrinks the font until the text fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, maxWidth: number) {
  let current = size;
  ctx.font = font(current);
  while (current > 18 && ctx.measureText(text).width > maxWidth) {
    current -= 2;
    ctx.font = font(current);
  }
}

function drawGymnast(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, colour: string) {
  // The split-leap figure used on the site's home page, as an outline.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.strokeStyle = colour;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.arc(100, 58, 12, 0, Math.PI * 2);
  ctx.stroke();
  for (const d of ['M100 72 Q101 100 104 124', 'M104 124 Q150 116 190 110', 'M104 124 Q60 130 14 122', 'M101 86 Q78 66 58 40', 'M101 86 Q126 68 148 46']) {
    ctx.stroke(new Path2D(d));
  }
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, colour: string) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : r * 0.45;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawImageFitted(ctx: CanvasRenderingContext2D, image: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number) {
  const ratio = Math.min(maxW / image.width, maxH / image.height);
  const w = image.width * ratio;
  const h = image.height * ratio;
  ctx.drawImage(image, cx - w / 2, cy - h / 2, w, h);
}

export function drawCertificate(canvas: HTMLCanvasElement, template: CertificateTemplate, text: CertificateText) {
  canvas.width = CERT_WIDTH;
  canvas.height = CERT_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const W = CERT_WIDTH;
  const H = CERT_HEIGHT;
  const dark = template === 'stars';
  const ink = dark ? '#FFFFFF' : DEEP;
  const soft = dark ? '#E4D7EE' : PURPLE;

  // Background and frame
  if (template === 'classic') {
    ctx.fillStyle = LAVENDER;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = DEEP;
    ctx.lineWidth = 14;
    ctx.strokeRect(40, 40, W - 80, H - 80);
    ctx.lineWidth = 4;
    ctx.strokeRect(72, 72, W - 144, H - 144);
    drawGymnast(ctx, W - 380, H - 330, 1.4, PURPLE);
  } else if (template === 'medal') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = PURPLE;
    ctx.fillRect(0, 0, 150, H);
    ctx.fillStyle = LINE;
    ctx.fillRect(150, 0, 18, H);
    ctx.strokeStyle = PURPLE;
    ctx.lineWidth = 6;
    ctx.strokeRect(210, 50, W - 260, H - 100);
    // Medal on its ribbon
    ctx.fillStyle = PURPLE;
    ctx.beginPath();
    ctx.moveTo(1330, 50);
    ctx.lineTo(1390, 50);
    ctx.lineTo(1420, 230);
    ctx.lineTo(1300, 230);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(1360, 290, 80, 0, Math.PI * 2);
    ctx.fill();
    drawStar(ctx, 1360, 290, 44, '#FFFFFF');
  } else {
    ctx.fillStyle = DEEP;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 6;
    ctx.strokeRect(50, 50, W - 100, H - 100);
    const stars: [number, number, number][] = [[140, 150, 22], [260, 980, 16], [1460, 160, 26], [1380, 960, 18], [1500, 560, 12], [100, 560, 14], [800, 1010, 12]];
    for (const [x, y, r] of stars) drawStar(ctx, x, y, r, GOLD);
    drawGymnast(ctx, 120, H - 360, 1.2, '#E4D7EE');
  }

  const left = template === 'medal' ? 260 : 0;
  const centre = template === 'medal' ? (W + left) / 2 - 60 : W / 2;
  // The medal sits top right, so text on that design stays narrower.
  const room = template === 'medal' ? 820 : 1100;

  // Club logo and name
  let top = 150;
  if (text.logo) {
    drawImageFitted(ctx, text.logo, centre, 180, 220, 140);
    top = 290;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = soft;
  fitText(ctx, text.clubName.toUpperCase(), (s) => `600 ${s}px Outfit, sans-serif`, 34, room);
  ctx.fillText(text.clubName.toUpperCase(), centre, top + 10);

  // Title
  ctx.fillStyle = ink;
  fitText(ctx, text.title, (s) => `650 ${s}px Fraunces, Georgia, serif`, 84, room);
  ctx.fillText(text.title, centre, top + 130);

  ctx.fillStyle = soft;
  ctx.font = '400 34px Outfit, sans-serif';
  ctx.fillText('is proudly awarded to', centre, top + 210);

  // Gymnast name, underlined
  ctx.fillStyle = ink;
  fitText(ctx, text.gymnastName, (s) => `650 ${s}px Fraunces, Georgia, serif`, 110, room);
  ctx.fillText(text.gymnastName, centre, top + 340);
  ctx.strokeStyle = template === 'stars' ? GOLD : PURPLE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(centre - 420, top + 375);
  ctx.lineTo(centre + 420, top + 375);
  ctx.stroke();

  ctx.fillStyle = soft;
  ctx.font = '400 32px Outfit, sans-serif';
  ctx.fillText(`Awarded on ${formatDate(text.awardDate)}`, centre, top + 440);

  // Signature and coach
  const sigY = H - 190;
  if (text.signature) drawImageFitted(ctx, text.signature, centre, sigY - 60, 360, 110);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centre - 220, sigY);
  ctx.lineTo(centre + 220, sigY);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = '600 30px Outfit, sans-serif';
  ctx.fillText(text.coachName || 'Coach', centre, sigY + 44);
  ctx.fillStyle = soft;
  ctx.font = '400 24px Outfit, sans-serif';
  ctx.fillText('Coach', centre, sigY + 78);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('CANVAS'))), 'image/png');
  });
}

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  const iconsDir = join(__dirname, '..', 'public', 'icons');
  await mkdir(iconsDir, { recursive: true });

  // Professional EduTrack blue (#1E40AF) with white "ET" text
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#1E40AF" rx="64"/>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" 
            font-family="system-ui, -apple-system, sans-serif" font-size="220" 
            font-weight="800" fill="#FFFFFF" letter-spacing="-4">ET</text>
    </svg>
  `;

  const buffer = Buffer.from(svg);

  await sharp(buffer)
    .resize(192, 192)
    .toFile(join(iconsDir, 'icon-192.png'));
    
  await sharp(buffer)
    .resize(512, 512)
    .toFile(join(iconsDir, 'icon-512.png'));

  console.log('✅ PWA icons generated successfully in public/icons/');
}

generateIcons().catch(console.error);